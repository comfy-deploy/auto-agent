import { tool } from 'ai';
import { z } from 'zod';
import { falApiClient } from '../../services/fal-api';

export const falSearchTool = tool({
  description: 'Search for FAL AI models by query or category. Use this to find AI models for specific tasks like image generation, video creation, etc.',
  parameters: z.object({
    query: z.string().optional().describe('Search terms for finding models (e.g., "image", "video", "text-to-image")'),
    category: z.string().optional().describe('Specific category filter (e.g., "text-to-image", "image-to-video", "image-to-image")'),
    limit: z.number().optional().default(5).describe('Maximum number of results to return (1-20)')
  }),
  execute: async ({ query, category, limit = 5 }) => {
    try {
      let models = falApiClient.getAllModels();
      
      if (!models || models.length === 0) {
        return {
          success: false,
          error: 'No FAL models available. The service may not be initialized.'
        };
      }

      // Filter by category if specified
      if (category) {
        models = models.filter(model => model.category === category);
      }

      // Filter by query if specified
      if (query) {
        const lowercaseQuery = query.toLowerCase();
        models = models.filter(model => {
          const searchableText = `${model.title} ${model.shortDescription} ${model.category} ${model.tags.join(' ')}`.toLowerCase();
          return searchableText.includes(lowercaseQuery);
        });
      }

      // Sort by highlighted models first, then by title
      models.sort((a, b) => {
        if (a.highlighted && !b.highlighted) return -1;
        if (!a.highlighted && b.highlighted) return 1;
        return a.title.localeCompare(b.title);
      });

      const limitedModels = models.slice(0, Math.min(limit, 20));
      const totalAvailable = models.length;

      const formattedModels = limitedModels.map(model => ({
        id: model.id,
        title: model.title,
        description: model.shortDescription,
        category: model.category,
        tags: model.tags,
        url: model.modelUrl || `https://fal.run/${model.id}`,
        highlighted: model.highlighted
      }));

      return {
        success: true,
        count: formattedModels.length,
        totalAvailable,
        models: formattedModels,
        searchQuery: query,
        searchCategory: category
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while searching FAL models'
      };
    }
  }
});