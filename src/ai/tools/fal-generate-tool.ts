import { tool } from 'ai';
import { z } from 'zod';
import { toolRegistry } from '../../agent/tools/tool-registry';

export const falGenerateToolTool = tool({
  description: 'Generate a dynamic tool for a specific FAL AI model endpoint. This creates a new tool that can be used to interact with that specific model.',
  parameters: z.object({
    endpointId: z.string().describe('The FAL AI endpoint ID (e.g., "fal-ai/flux/schnell", "fal-ai/imagen4/preview")')
  }),
  execute: async ({ endpointId }) => {
    try {
      if (!endpointId) {
        return {
          success: false,
          error: 'Endpoint ID is required'
        };
      }

      // Check if tool already exists
      if (toolRegistry.hasToolForEndpoint(endpointId)) {
        const toolDescription = toolRegistry.getToolDescription(endpointId);
        return {
          success: true,
          status: 'exists',
          endpointId,
          message: `Tool for ${endpointId} already exists`,
          toolDescription
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
        status: 'created',
        endpointId,
        message: `Successfully generated tool for ${endpointId}`,
        toolDescription
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while generating tool'
      };
    }
  }
});