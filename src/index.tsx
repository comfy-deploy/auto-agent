import { serve, spawn } from "bun";
import index from "./index.html";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, generateObject, jsonSchema, stepCountIs, streamText, tool, type ToolSet } from 'ai';
import { z } from "zod";

import Exa from 'exa-js';
import { fal } from "@fal-ai/client";

export const exa = new Exa(process.env.EXA_API_KEY);

// Model quality rankings - based on performance, popularity, and reliability
const MODEL_QUALITY_SCORES: Record<string, number> = {
  // Image generation - Flux models are top tier
  'fal-ai/flux/schnell': 95,
  'fal-ai/flux/dev': 98, // Best overall image quality
  'fal-ai/flux-pro': 100, // Highest quality, slower
  'fal-ai/flux-realism': 92,
  'fal-ai/flux-kontext': 96, // Excellent at following complex prompts and context
  
  // Other strong image models
  'fal-ai/stable-diffusion-v3-medium': 85,
  'fal-ai/sdxl': 80,
  'fal-ai/recraft-v3': 88,
  
  // Video generation
  'fal-ai/runway-gen3/turbo/image-to-video': 90,
  'fal-ai/luma-dream-machine': 85,
  'fal-ai/kling-video/v1/standard/image-to-video': 80,
  
  // Upscaling
  'fal-ai/clarity-upscaler': 92,
  'fal-ai/real-esrgan': 85,
  
  // Audio
  'fal-ai/stable-audio': 88,
  
  // 3D
  'fal-ai/triposr': 85,
};

// Category    for different use cases
const CATEGORY_PREFERENCES = {
  'photorealistic': ['fal-ai/flux/dev', 'fal-ai/flux-realism'],
  'artistic': ['fal-ai/flux/schnell', 'fal-ai/recraft-v3'],
  'complex_prompts': ['fal-ai/flux-kontext', 'fal-ai/flux/dev'], // For detailed, complex descriptions
  'fast': ['fal-ai/flux/schnell', 'fal-ai/sdxl'],
  'highest_quality': ['fal-ai/flux-pro', 'fal-ai/flux/dev', 'fal-ai/flux-kontext'],
  'video': ['fal-ai/runway-gen3/turbo/image-to-video', 'fal-ai/luma-dream-machine'],
  'upscaling': ['fal-ai/clarity-upscaler', 'fal-ai/real-esrgan'],
};

// Helper function to use LLM for intelligent model selection
async function selectBestModelWithLLM(userQuery: string, candidateModels: any[], hasImageInput: boolean): Promise<any[]> {
  try {
    const modelDescriptions = candidateModels.map(model => 
      `${model.id}: ${model.title} - ${model.description} (Category: ${model.category}, Quality Score: ${model.qualityScore}${model.requiresImage ? ', Requires Image Input' : ''})`
    ).join('\n');

    const { object } = await generateObject({
      model: "anthropic/claude-4-sonnet",
      system: `You are an AI model selection expert. Given a user's request and available models, select the best 3 models in order of preference.

IMPORTANT SELECTION CRITERIA:
1. QUALITY: Higher quality scores indicate better, more reliable models
2. RELEVANCE: How well the model matches the user's specific needs
3. SPECIALIZATION: Models specialized for the task are preferred
4. CONTEXT: Consider if user wants speed vs quality, artistic vs photorealistic, etc.
5. IMAGE REQUIREMENTS: NEVER select models that require images when the user hasn't provided one

For image generation:
- Flux models (especially flux/dev, flux-pro, and flux-kontext) are generally the highest quality
- Choose flux/schnell for speed, flux/dev for balance, flux-pro for maximum quality
- Use flux-kontext for complex prompts with detailed descriptions and context
- Consider recraft-v3 for artistic/design work`,
      
      schema: z.object({
        selectedModels: z.array(z.string()).max(3).describe("Array of model IDs in order of preference"),
        reasoning: z.string().optional().describe("Brief explanation of the selection")
      }),
      
      messages: [
        {
          role: "user",
          content: `User request: "${userQuery}"
User has provided an image: ${hasImageInput ? 'YES' : 'NO'}

Available models:
${modelDescriptions}

Select the best 3 models for this request, prioritizing quality and relevance. ${!hasImageInput ? 'DO NOT select any models that require image input.' : ''}`
        }
      ],
    });

    console.log(`🤖 LLM Selection Reasoning: ${object.reasoning}`);
    
    // Return models in the LLM's preferred order
    return object.selectedModels.map((id: string) => 
      candidateModels.find(model => model.id === id)
    ).filter(Boolean);

  } catch (error) {
    console.error('Error in LLM model selection:', error);
    // Fallback to quality-based sorting
    return candidateModels
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
      .slice(0, 3);
  }
}

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
      'edit': ['image-to-image'],
      'modify': ['image-to-image'],
      'improve': ['image-to-image', 'upscaling'],
    };

    // Detect categories from user query
    const detectedCategories: string[] = [];
    for (const [term, categories] of Object.entries(categoryMap)) {
      if (queryLower.includes(term)) {
        detectedCategories.push(...categories);
      }
    }

    // Detect if user has provided an image or is referencing an existing image
    const hasImageInput = /\b(image_url|img|jpg|png|jpeg|gif|bmp|webp|upload|attach|from.*image|edit.*image|modify.*image|change.*image)\b/i.test(userQuery) ||
                         /https?:\/\/.*\.(jpg|jpeg|png|gif|bmp|webp)/i.test(userQuery) ||
                         /\b(this image|the image|my image|uploaded image|attached image|given image|provided image|base64)\b/i.test(userQuery) ||
                         /\b(using.*image|with.*image|take.*image|from.*photo)\b/i.test(userQuery);

    // Detect quality/speed preferences
    const wantsHighQuality = /\b(best|highest|premium|quality|professional|detailed)\b/i.test(userQuery);
    const wantsFast = /\b(fast|quick|rapid|speed|instant)\b/i.test(userQuery);
    const wantsPhotorealistic = /\b(photorealistic|realistic|photo|photograph)\b/i.test(userQuery);
    const wantsArtistic = /\b(artistic|art|creative|stylized|illustration)\b/i.test(userQuery);
    const hasComplexPrompt = userQuery.length > 100 || /\b(complex|detailed|intricate|elaborate|specific)\b/i.test(userQuery);

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
          limit: 20, // Get more results for better selection
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

    // Enhanced scoring with quality weighting
    const scoredModels = models.map((model: any) => {
      let score = 0;
      const searchText = `${model.title} ${model.shortDescription} ${model.category}`.toLowerCase();
      const modelId = model.id;

      // Base relevance score (keyword matching)
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      queryWords.forEach(word => {
        if (searchText.includes(word)) {
          score += 1;
        }
      });

      // Quality score (most important factor)
      const qualityScore = MODEL_QUALITY_SCORES[modelId] || 50; // Default score for unknown models
      score += qualityScore * 0.1; // Weight quality heavily

      // Preference-based scoring
      if (wantsHighQuality && qualityScore >= 90) score += 20;
      if (wantsFast && (modelId.includes('schnell') || modelId.includes('turbo'))) score += 15;
      if (wantsPhotorealistic && (modelId.includes('flux') || modelId.includes('realism'))) score += 15;
      if (wantsArtistic && (modelId.includes('recraft') || modelId.includes('artistic'))) score += 15;
      if (hasComplexPrompt && modelId.includes('kontext')) score += 25; // Flux Kontext excels at complex prompts

      // Category match bonus
      if (detectedCategories.includes(model.category)) score += 10;

      // Prefer non-deprecated, popular models
      if (!model.deprecated) score += 5;

      // Filter out image-to-image models when no image is provided
      const isImageToImageModel = model.category === 'image-to-image' || 
                                  modelId.includes('image-to-image') ||
                                  modelId.includes('img2img') ||
                                  modelId.includes('upscaler') ||
                                  modelId.includes('upscaling') ||
                                  modelId.includes('super-resolution') ||
                                  /\b(edit|modify|enhance|restore|colorize|inpaint|outpaint)\b/i.test(model.title);

      // Heavily penalize image-to-image models when no image is provided
      if (isImageToImageModel && !hasImageInput) {
        score -= 1000; // Effectively remove from consideration
      }

      return { 
        ...model, 
        relevanceScore: score,
        qualityScore: qualityScore,
        requiresImage: isImageToImageModel
      };
    });

    // Initial filtering and sorting
    const filteredModels = scoredModels
      .filter((model: any) => 
        model.relevanceScore > 5 || // Keep models with decent relevance
        detectedCategories.includes(model.category) || // Or matching category
        MODEL_QUALITY_SCORES[model.id] >= 80 // Or high-quality models
      )
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, Math.min(10, maxResults * 3)); // Get more candidates for LLM selection

    // Use LLM to intelligently select the best models
    const selectedModels = await selectBestModelWithLLM(userQuery, filteredModels, hasImageInput);
    
    // Take the requested number of results
    const finalModels = selectedModels.slice(0, maxResults);

    // Check if user is asking for image editing but hasn't provided an image
    const isAskingForImageEditing = /\b(edit|modify|enhance|upscale|improve|fix|restore|colorize|remove|add.*to|change.*in)\b/i.test(userQuery) && 
                                   /\b(image|photo|picture|pic)\b/i.test(userQuery);
    
    if (isAskingForImageEditing && !hasImageInput && finalModels.length === 0) {
      console.log(`⚠️  User seems to be asking for image editing but hasn't provided an image`);
    }

    console.log(`🎯 Selected ${finalModels.length} models for query: "${userQuery}"`);
    console.log(`📸 User has image input: ${hasImageInput}`);
    
    finalModels.forEach((model, i) => {
      console.log(`${i + 1}. ${model.id} (Quality: ${model.qualityScore}, Score: ${model.relevanceScore.toFixed(1)}${model.requiresImage ? ', Requires Image' : ''})`);
    });

    // Log any image-to-image models that were filtered out
    const filteredOutImageModels = filteredModels.filter(model => model.requiresImage && !hasImageInput);
    if (filteredOutImageModels.length > 0) {
      console.log(`🚫 Filtered out ${filteredOutImageModels.length} image-to-image models (no image provided):`);
      filteredOutImageModels.forEach(model => {
        console.log(`   - ${model.id} (${model.title})`);
      });
    }

    return finalModels.map((model: any) => ({
      id: model.id,
      title: model.title,
      category: model.category,
      description: model.shortDescription,
      url: model.modelUrl,
      pricing: model.pricingInfoOverride,
      relevanceScore: model.relevanceScore,
      qualityScore: model.qualityScore
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
      // Handle enum first
      if (schema.enum && schema.enum.length > 0) {
        return z.enum(schema.enum);
      }

      let stringSchema = z.string();

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
        return stringSchema.default(schema.default);
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
        return numberSchema.default(schema.default);
      }

      return numberSchema;

    case 'boolean':
      let boolSchema = z.boolean();
      if (schema.default !== undefined) {
        return boolSchema.default(schema.default);
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
          return arraySchema.default(schema.default);
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

        console.log(parameters);

        const result = await fal.subscribe(modelInfo.id, {
          input: parameters,
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });

        console.log(result.data);

        // Return a dummy success message
        return result.data.images;
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

export const webSearch = tool({
  description: 'Search the web for up-to-date information',
  inputSchema: z.object({
    query: z.string().min(1).max(100).describe('The search query'),
  }),
  execute: async ({ query }, {
    toolCallId,
  }) => {
    console.log("Searching the web for:", query);

    const { results } = await exa.searchAndContents(query, {
      livecrawl: 'always',
      numResults: 3,
    });
    console.log("Results:", results);
    return results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.text.slice(0, 1000), // take just the first 1000 characters
      publishedDate: result.publishedDate,
    }));
  },
});

export const falTools = tool({
  description: "Use a fal.ai model to create an image or video, 3d models, or even more, based on the user's prompt",
  inputSchema: z.object({
    prompt: z.string(),
  }),
  execute: async ({ prompt }) => {
    console.log("Searching fal.ai models for:", prompt);
    const tools = await createVercelToolsFromModels(await searchFalModels(prompt, 5));

    const { content } = await generateText({
      model: "anthropic/claude-4-sonnet",
      system: `You are a creative agent. The agent has decided to use the following tools to create the user's prompt. Some tools might require image_url, make sure to only use those when you have existing images`,
      prompt: prompt,
      tools,
    })

    console.log(content);

    return content;
  }
});

function createAIStream(messages: any[]) {
  return streamText({
    model: "anthropic/claude-4-sonnet",
    system: `You are a creative agent.
    1. You are given a message from a user.
    2. Help the user to plan our their creative goal, until you feel confident that you have a good understanding of their goal, if its not clear, try looking it up with websearch.
    3. Once you have a good understanding of the user's goal, you will need to select the best tool to use.
    4. You will then need to call the tool with the appropriate parameters. And if the task is complicated, plan multiple steps and call the tool multiple times.
    5. You will then return the result of the tool call.
    6. You will also need to return the tool that was used.
    7. You will also need to return the parameters that were used.
    8. You will also need to return the result of the tool call.
    `,
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools: {
      webSearch,
      falTools,
    },
  });

  // const matchingModels = await searchFalModels(message, 5);
  // const tools = await createVercelToolsFromModels(matchingModels);

  // console.log(tools);
}

const server = serve({
  idleTimeout: 200,
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/chat": {
      async POST(req) {
        try {
          const body = await req.json();
          const { messages } = body;

          if (!messages) {
            return Response.json(
              { error: "Messages is required" },
              { status: 400 }
            );
          }

          console.log(messages);

          const stream = createUIMessageStream({
            execute: ({ writer }) => {
              writer.merge(createAIStream(messages).toUIMessageStream())
            }
          })

          return createUIMessageStreamResponse({ stream })
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
