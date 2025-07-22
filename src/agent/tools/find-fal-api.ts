import { Tool, ToolResult } from './base';
import { falApiClient, FalModel } from '../../services/fal-api';

interface FindFalApiParams {
  query?: string;
  category?: string;
  limit?: number;
}

export const findFalApiTool: Tool = {
  name: 'findFalAPI',
  description: 'Search for FAL AI models by query string or category. Returns a list of available models with their details.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find models by title, description, or tags'
      },
      category: {
        type: 'string',
        description: 'Filter by model category (e.g., "text-to-image", "image-to-video", "image-to-image")'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)'
      }
    }
  },
  
  async execute(params: FindFalApiParams): Promise<ToolResult> {
    try {
      let models: FalModel[] = [];
      
      if (params.query) {
        models = falApiClient.searchModels(params.query);
      } else if (params.category) {
        models = falApiClient.getModelsByCategory(params.category);
      } else {
        models = falApiClient.getAllModels();
      }
      
      const limit = params.limit || 10;
      const limitedModels = models.slice(0, limit);
      
      const formattedResults = limitedModels.map(model => ({
        id: model.id,
        title: model.title,
        description: model.shortDescription,
        category: model.category,
        tags: model.tags,
        url: model.modelUrl,
        highlighted: model.highlighted
      }));
      
      return {
        success: true,
        data: {
          count: formattedResults.length,
          totalAvailable: models.length,
          models: formattedResults
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