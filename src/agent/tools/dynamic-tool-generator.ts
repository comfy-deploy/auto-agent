interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    description?: string;
    'x-fal-metadata'?: {
      endpointId: string;
      category: string;
    };
  };
  components: {
    schemas: Record<string, any>;
  };
  paths: Record<string, any>;
  servers: Array<{ url: string }>;
}

interface DynamicToolConfig {
  name: string;
  description: string;
  endpointId: string;
  inputSchema: any;
  outputSchema: any;
  baseUrl: string;
  postPath: string;
}

export class DynamicToolGenerator {
  static generateToolFromOpenAPI(spec: OpenAPISchema): DynamicToolConfig | null {
    try {
      const endpointId = spec.info['x-fal-metadata']?.endpointId;
      if (!endpointId) return null;

      // Find the main POST endpoint
      const postPath = Object.keys(spec.paths).find(path => 
        spec.paths[path].post && !path.includes('/requests/')
      );
      
      if (!postPath) return null;

      const postSpec = spec.paths[postPath].post;
      const inputSchemaRef = postSpec.requestBody?.content?.['application/json']?.schema?.$ref;
      const inputSchemaName = inputSchemaRef?.split('/').pop();
      
      // Find response schema for 200 status
      const responseSchemaRef = postSpec.responses?.['200']?.content?.['application/json']?.schema?.$ref;
      const responseSchemaName = responseSchemaRef?.split('/').pop();

      const inputSchema = inputSchemaName ? spec.components.schemas[inputSchemaName] : null;
      const outputSchema = responseSchemaName ? spec.components.schemas[responseSchemaName] : null;

      return {
        name: endpointId.replace(/[^a-zA-Z0-9]/g, '_'),
        description: `${spec.info.title} - ${spec.info.description || 'AI model endpoint'}`,
        endpointId,
        inputSchema,
        outputSchema,
        baseUrl: spec.servers[0]?.url || 'https://queue.fal.run',
        postPath
      };
    } catch (error) {
      console.error('Failed to generate tool from OpenAPI spec:', error);
      return null;
    }
  }

  static createDynamicTool(config: DynamicToolConfig) {
    return class DynamicTool {
      static config = config;
      
      static getName() {
        return config.name;
      }
      
      static getDescription() {
        return config.description;
      }
      
      static getInputSchema() {
        return config.inputSchema;
      }
      
      static async execute(input: any, falApiKey?: string) {
        if (!falApiKey) {
          throw new Error('FAL API key is required for dynamic tool execution');
        }

        // Validate input against schema (basic validation)
        if (config.inputSchema?.required) {
          for (const required of config.inputSchema.required) {
            if (!(required in input)) {
              throw new Error(`Missing required parameter: ${required}`);
            }
          }
        }

        try {
          // Submit request to FAL queue
          const response = await fetch(`${config.baseUrl}${config.postPath}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Key ${falApiKey}`
            },
            body: JSON.stringify(input)
          });

          if (!response.ok) {
            throw new Error(`FAL API error: ${response.status} ${response.statusText}`);
          }

          const queueStatus = await response.json();
          
          // For now, return the queue status - in a real implementation,
          // you'd poll the status_url until completion
          return {
            tool: config.name,
            endpointId: config.endpointId,
            status: 'submitted',
            queueStatus,
            message: `Task submitted to ${config.endpointId}. Request ID: ${queueStatus.request_id}`
          };
        } catch (error) {
          throw new Error(`Failed to execute ${config.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
  }
}