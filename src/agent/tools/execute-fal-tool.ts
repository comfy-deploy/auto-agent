import { Tool, ToolResult } from './base';
import { toolRegistry } from './tool-registry';

interface ExecuteFalToolParams {
  endpointId: string;
  input: any;
}

export const executeFalToolTool: Tool = {
  name: 'executeFalTool',
  description: 'Execute a dynamically generated FAL AI tool with given parameters',
  
  async execute(params: ExecuteFalToolParams): Promise<ToolResult> {
    try {
      const { endpointId, input } = params;
      
      if (!endpointId) {
        return {
          success: false,
          error: 'endpointId is required'
        };
      }

      if (!input) {
        return {
          success: false,
          error: 'input parameters are required'
        };
      }

      // Check if tool exists
      if (!toolRegistry.hasToolForEndpoint(endpointId)) {
        return {
          success: false,
          error: `Tool for ${endpointId} not found. Generate it first using generateFalTool.`
        };
      }

      // Execute the tool
      const result = await toolRegistry.executeTool(endpointId, input);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};