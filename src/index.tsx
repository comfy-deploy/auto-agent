import { serve } from "bun";
import index from "./index.html";
import { generateText, jsonSchema } from 'ai';
import { z } from "zod";

// Helper function to search fal.ai models
async function searchFalModels(userQuery: string, maxResults: number = 3) {
  try {
    // Extract keywords and potential categories from user query
    const queryLower = userQuery.toLowerCase();

    // Map common user terms to fal categories
    const categoryMap: Record<string, string[]> = {
      'image': ['text-to-image', 'image-to-image'],
      'video': ['text-to-video', 'image-to-video'],
      'audio': ['text-to-audio'],
      'upscale': ['upscaling'],
      'enhance': ['enhancement'],
    };

    // Detect categories from user query
    const detectedCategories: string[] = [];
    for (const [term, categories] of Object.entries(categoryMap)) {
      if (queryLower.includes(term)) {
        detectedCategories.push(...categories);
      }
    }

    // Build the API URL with parameters
    const params = {
      "0": {
        json: {
          keywords: userQuery,
          categories: detectedCategories,
          tags: [],
          type: [],
          deprecated: false,
          pendingEnterprise: false,
          sort: "relevant",
          page: 1,
          limit: 20, // Limit to most relevant results
          favorites: false,
          useCache: true
        }
      }
    };

    const encodedParams = encodeURIComponent(JSON.stringify(params));
    const falApiUrl = `https://fal.ai/api/trpc/models.list?batch=1&input=${encodedParams}`;

    const response = await fetch(falApiUrl);
    const data = await response.json();

    // Extract and filter models
    const models = data[0]?.result?.data?.json?.items || [];

    // Score and filter models based on relevance to user query
    const scoredModels = models.map((model: any) => {
      let score = 0;
      const searchText = `${model.title} ${model.shortDescription} ${model.category}`.toLowerCase();

      // Simple keyword matching for relevance scoring
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      queryWords.forEach(word => {
        if (searchText.includes(word)) {
          score += 1;
        }
      });

      return { ...model, relevanceScore: score };
    });

    // Sort by relevance score and filter out low scores
    const filteredModels = scoredModels
      .filter((model: any) => model.relevanceScore > 0 || detectedCategories.includes(model.category))
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults); // Return top 10 results

    return filteredModels.map((model: any) => ({
      id: model.id,
      title: model.title,
      category: model.category,
      description: model.shortDescription,
      url: model.modelUrl,
      pricing: model.pricingInfoOverride,
      relevanceScore: model.relevanceScore
    }));

  } catch (error) {
    console.error('Error searching fal models:', error);
    throw error;
  }
}

// Helper function to fetch OpenAPI spec for a fal.ai model
async function fetchModelOpenAPI(modelId: string) {
  try {
    const encodedModelId = encodeURIComponent(modelId);
    const openApiUrl = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodedModelId}`;

    const response = await fetch(openApiUrl);
    const openApiSpec = await response.json();

    return openApiSpec;
  } catch (error) {
    console.error(`Error fetching OpenAPI spec for ${modelId}:`, error);
    return null;
  }
}

// Helper function to resolve $ref references in a schema
function resolveSchemaRefs(schema: any, components: any, visited = new Set()): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Handle $ref resolution
  if (schema.$ref) {
    const refPath = schema.$ref;
    
    // Check for circular references
    if (visited.has(refPath)) {
      console.warn(`Circular reference detected: ${refPath}`);
      return { type: 'object' }; // Return a simple fallback
    }
    
    // Extract the reference key (e.g., "#/components/schemas/ImageSize" -> "ImageSize")
    const refKey = refPath.split('/').pop();
    
    if (components.schemas && components.schemas[refKey]) {
      visited.add(refPath);
      const resolvedSchema = resolveSchemaRefs(components.schemas[refKey], components, visited);
      visited.delete(refPath);
      return resolvedSchema;
    } else {
      console.warn(`Reference not found: ${refPath}`);
      return { type: 'object' };
    }
  }

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map(item => resolveSchemaRefs(item, components, visited));
  }

  // Handle objects
  const resolved: any = {};
  for (const [key, value] of Object.entries(schema)) {
    resolved[key] = resolveSchemaRefs(value, components, visited);
  }

  return resolved;
}

// Helper function to convert JSON Schema to Zod schema
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  // Handle different schema types
  switch (schema.type) {
    case 'string':
      let stringSchema = z.string();
      
      // Handle enum
      if (schema.enum && schema.enum.length > 0) {
        return z.enum(schema.enum);
      }
      
      // Handle string constraints
      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      
      // Handle default value
      if (schema.default !== undefined) {
        stringSchema = stringSchema.default(schema.default);
      }
      
      return stringSchema;

    case 'number':
    case 'integer':
      let numberSchema = schema.type === 'integer' ? z.number().int() : z.number();
      
      if (schema.minimum !== undefined) {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        numberSchema = numberSchema.max(schema.maximum);
      }
      if (schema.default !== undefined) {
        numberSchema = numberSchema.default(schema.default);
      }
      
      return numberSchema;

    case 'boolean':
      let boolSchema = z.boolean();
      if (schema.default !== undefined) {
        boolSchema = boolSchema.default(schema.default);
      }
      return boolSchema;

    case 'array':
      if (schema.items) {
        const itemSchema = jsonSchemaToZod(schema.items);
        let arraySchema = z.array(itemSchema);
        
        if (schema.minItems !== undefined) {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (schema.maxItems !== undefined) {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        if (schema.default !== undefined) {
          arraySchema = arraySchema.default(schema.default);
        }
        
        return arraySchema;
      }
      return z.array(z.any());

    case 'object':
      if (schema.properties) {
        const zodObject: Record<string, z.ZodTypeAny> = {};
        
        // Convert each property
        for (const [key, prop] of Object.entries(schema.properties)) {
          zodObject[key] = jsonSchemaToZod(prop);
        }
        
        let objectSchema = z.object(zodObject);
        
        // Handle required fields
        if (schema.required && Array.isArray(schema.required)) {
          // Zod objects are required by default, so we need to make non-required fields optional
          const optionalKeys = Object.keys(zodObject).filter(key => !schema.required.includes(key));
          if (optionalKeys.length > 0) {
            objectSchema = objectSchema.partial(
              optionalKeys.reduce((acc, key) => ({ ...acc, [key]: true }), {})
            );
          }
        } else {
          // If no required array, make all fields optional
          objectSchema = objectSchema.partial();
        }
        
        return objectSchema;
      }
      return z.object({});

    default:
      // Handle special cases
      
      // Handle anyOf (union types)
      if (schema.anyOf && Array.isArray(schema.anyOf)) {
        const unionSchemas = schema.anyOf.map((subSchema: any) => jsonSchemaToZod(subSchema));
        return z.union(unionSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      }
      
      // Handle oneOf (discriminated union)
      if (schema.oneOf && Array.isArray(schema.oneOf)) {
        const unionSchemas = schema.oneOf.map((subSchema: any) => jsonSchemaToZod(subSchema));
        return z.union(unionSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      }
      
      // Handle allOf (intersection - approximated as merge for objects)
      if (schema.allOf && Array.isArray(schema.allOf)) {
        const schemas = schema.allOf.map((subSchema: any) => jsonSchemaToZod(subSchema));
        // For simplicity, merge object schemas or return the first one
        return schemas.reduce((acc, curr) => {
          if (acc._def.typeName === 'ZodObject' && curr._def.typeName === 'ZodObject') {
            return acc.merge(curr);
          }
          return acc;
        });
      }
      
      // Fallback for unhandled types
      console.warn(`Unhandled schema type: ${schema.type}`, schema);
      return z.any();
  }
}

// Helper function to transform OpenAPI spec into a Vercel AI SDK tool definition
function transformOpenAPIToVercelTool(modelInfo: any, openApiSpec: any) {
  try {
    if (!openApiSpec || !openApiSpec.components?.schemas) {
      console.warn(`No schemas found for model ${modelInfo.id}`);
      return null;
    }

    // Find the input schema (usually the one that doesn't contain "Output" or "Status")
    const inputSchemaKey = Object.keys(openApiSpec.components.schemas).find(key =>
      (!key.includes('Output') && !key.includes('Status') && !key.includes('Image')) || key.includes('Input')
    );

    if (!inputSchemaKey) {
      console.warn(`No suitable input schema found for model ${modelInfo.id}`);
      return null;
    }

    const inputSchema = openApiSpec.components.schemas[inputSchemaKey];
    if (!inputSchema || typeof inputSchema !== 'object') {
      console.warn(`Invalid input schema for model ${modelInfo.id}:`, inputSchema);
      return null;
    }

    const toolName = modelInfo.id.replace(/[^a-zA-Z0-9_]/g, '_'); // Make it a valid function name

    // Resolve all $ref references in the schema
    const resolvedSchema = resolveSchemaRefs(inputSchema, openApiSpec.components);
    
    console.log(`Resolved schema for ${modelInfo.id}:`, JSON.stringify(resolvedSchema, null, 2));

    // Convert the resolved schema to Zod
    const zodSchema = jsonSchemaToZod(resolvedSchema);

    console.log('Zod schema created for:', modelInfo.id);

    // Transform the schema into Vercel AI SDK tool format using Zod
    const tool = {
      description: `${modelInfo.title}: ${modelInfo.description}`,
      inputSchema: zodSchema,
      execute: async (parameters: any) => {
        // Log the execution
        console.log(`🚀 Executing tool: ${toolName}`);
        console.log(`📋 Model ID: ${modelInfo.id}`);
        console.log(`📝 Parameters:`, JSON.stringify(parameters, null, 2));
        console.log(`🏷️  Category: ${modelInfo.category}`);
        console.log(`💰 Pricing: ${modelInfo.pricing || 'Not specified'}`);
        console.log(`🔗 Endpoint: ${openApiSpec.servers?.[0]?.url || "https://queue.fal.run"}`);

        // Return a dummy success message
        return {
          success: true,
          message: `Successfully executed ${modelInfo.title}`,
          toolName: toolName,
          modelId: modelInfo.id,
          category: modelInfo.category,
          executedAt: new Date().toISOString(),
          parameters: parameters,
          note: "This is a dummy response. In a real implementation, this would call the actual fal.ai API."
        };
      }
    };

    console.log(`✅ Successfully created tool: ${toolName} for model ${modelInfo.id} using Zod schema`);
    return { [toolName]: tool };
  } catch (error) {
    console.error(`Error creating tool for model ${modelInfo.id}:`, error);
    return null;
  }
}

// Helper function to create Vercel AI SDK compatible tools from model search results
async function createVercelToolsFromModels(models: any[]) {
  const toolPromises = models.map(async (model) => {
    const openApiSpec = await fetchModelOpenAPI(model.id);
    if (openApiSpec) {
      return transformOpenAPIToVercelTool(model, openApiSpec);
    }
    return null;
  });

  const toolResults = await Promise.all(toolPromises);
  const validTools = toolResults.filter(tool => tool !== null);

  // Merge all tool objects into a single object
  const mergedTools = validTools.reduce((acc, tool) => {
    return { ...acc, ...tool };
  }, {});

  return mergedTools;
}

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    "/api/agent": {
      async POST(req) {
        try {
          const body = await req.json();
          const { prompt } = body;

          if (!prompt) {
            return Response.json(
              { error: "Message is required" },
              { status: 400 }
            );
          }

          const matchingModels = await searchFalModels(prompt, 5);
          const tools = await createVercelToolsFromModels(matchingModels);

          console.log(tools);

          const { content } = await generateText({
            model: "anthropic/claude-4-sonnet",
            messages: [
              {
                role: 'system',
                content: 'You are a helpful AI assistant. Based on the user prompt, you will need to select the best tool to use. You will then need to call the tool with the appropriate parameters. You will then return the result of the tool call.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            tools: tools,
          });

          return Response.json(content);
        } catch (error) {
          console.error('Agent error:', error);
          return Response.json(
            { error: "Failed to process request" },
            { status: 500 }
          );
        }
      },
    },
  },

  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
