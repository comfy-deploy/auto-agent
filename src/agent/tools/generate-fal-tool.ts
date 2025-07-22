import { Tool, ToolResult } from './base';
import { toolRegistry } from './tool-registry';

interface GenerateFalToolParams {
  endpointId: string;
}

export const generateFalToolTool: Tool = {
  name: 'generateFalTool',
  description: 'Generate a dynamic tool for a specific FAL AI model endpoint',
  
  async execute(params: GenerateFalToolParams): Promise<ToolResult> {
    try {
      const { endpointId } = params;
      
      if (!endpointId) {
        return {
          success: false,
          error: 'endpointId is required'
        };
      }

      // Check if tool already exists
      if (toolRegistry.hasToolForEndpoint(endpointId)) {
        const toolDescription = toolRegistry.getToolDescription(endpointId);
        return {
          success: true,
          data: {
            endpointId,
            status: 'exists',
            message: `Tool for ${endpointId} already exists`,
            toolDescription
          }
        };
      }

      // Generate the tool
      const result = await toolRegistry.generateToolForEndpoint(endpointId);
      
      if (!result) {
        return {
          success: false,
          error: `Failed to generate tool for ${endpointId}. The endpoint may not exist or may not have a valid OpenAPI spec.`
        };
      }

      const toolDescription = toolRegistry.getToolDescription(endpointId);
      
      return {
        success: true,
        data: {
          endpointId,
          status: 'created',
          message: `Successfully generated tool for ${endpointId}`,
          toolDescription
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};