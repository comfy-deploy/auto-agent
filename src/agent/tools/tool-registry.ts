import { DynamicToolGenerator } from './dynamic-tool-generator';
import { falApiClient } from '../../services/fal-api';

interface ToolInfo {
  name: string;
  description: string;
  endpointId: string;
  toolClass: any;
  createdAt: Date;
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private dynamicTools: Map<string, ToolInfo> = new Map();
  private falApiKey?: string;

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  setFalApiKey(apiKey: string) {
    this.falApiKey = apiKey;
  }

  async generateToolForEndpoint(endpointId: string): Promise<string | null> {
    // Check if tool already exists
    if (this.dynamicTools.has(endpointId)) {
      return endpointId;
    }

    try {
      const modelAndSpec = await falApiClient.getModelWithOpenAPISpec(endpointId);
      if (!modelAndSpec) {
        console.error(`Could not fetch model and OpenAPI spec for ${endpointId}`);
        return null;
      }

      const { model, spec } = modelAndSpec;
      const toolConfig = DynamicToolGenerator.generateToolFromOpenAPI(spec);
      
      if (!toolConfig) {
        console.error(`Could not generate tool config for ${endpointId}`);
        return null;
      }

      const toolClass = DynamicToolGenerator.createDynamicTool(toolConfig);
      
      this.dynamicTools.set(endpointId, {
        name: toolConfig.name,
        description: toolConfig.description,
        endpointId,
        toolClass,
        createdAt: new Date()
      });

      console.log(`Generated dynamic tool for ${endpointId}`);
      return endpointId;
    } catch (error) {
      console.error(`Failed to generate tool for ${endpointId}:`, error);
      return null;
    }
  }

  async executeTool(endpointId: string, input: any): Promise<any> {
    const toolInfo = this.dynamicTools.get(endpointId);
    if (!toolInfo) {
      throw new Error(`Tool not found for endpoint: ${endpointId}`);
    }

    return toolInfo.toolClass.execute(input, this.falApiKey);
  }

  getTool(endpointId: string): ToolInfo | undefined {
    return this.dynamicTools.get(endpointId);
  }

  getAllTools(): ToolInfo[] {
    return Array.from(this.dynamicTools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.dynamicTools.keys());
  }

  hasToolForEndpoint(endpointId: string): boolean {
    return this.dynamicTools.has(endpointId);
  }

  clearAll() {
    this.dynamicTools.clear();
  }

  getToolDescription(endpointId: string): string | null {
    const tool = this.dynamicTools.get(endpointId);
    if (!tool) return null;
    
    const inputSchema = tool.toolClass.getInputSchema();
    const properties = inputSchema?.properties || {};
    
    let description = `${tool.description}\n\nAvailable parameters:\n`;
    
    for (const [prop, schema] of Object.entries(properties)) {
      const propSchema = schema as any;
      const required = inputSchema?.required?.includes(prop) ? ' (required)' : ' (optional)';
      const type = propSchema.type || 'unknown';
      const desc = propSchema.description || '';
      description += `- ${prop}${required}: ${type} - ${desc}\n`;
    }
    
    return description;
  }
}

export const toolRegistry = ToolRegistry.getInstance();