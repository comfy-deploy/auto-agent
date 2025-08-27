import { RedisClient, serve, spawn, write } from "bun";
import index from "./index.html";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, generateObject, jsonSchema, stepCountIs, streamText, tool, type ToolSet, type UIMessageStreamWriter, type UIMessage, type UIDataTypes, type UITools, streamObject, generateId, consumeStream, experimental_createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { z } from "zod";
import { QueryClient, dehydrate } from '@tanstack/react-query';
// import { RedisMemoryServer } from 'redis-memory-server';
import { Redis } from "@upstash/redis";
// import { createResumableStreamContext } from 'resumable-stream/ioredis';
import { READ_ONLY_EXAMPLE_CHAT_IDS } from './lib/constants';
import { Ratelimit } from "@upstash/ratelimit";
import { DEFAULT_TEXT_MODEL } from '@/lib/models';

// TypeScript declaration for globalThis extension
declare global {
  var appState: {
    activeStreams: Set<string>; // Changed from number to Set<string>
    isShuttingDown: boolean;
    shutdownInProgress: boolean;
    gracefulShutdownSetup: boolean;
    mcpClient: any | null; // Add MCP client storage
    mcpClientRefCount: number; // Track how many sessions are using it
  };
}

// Initialize Redis asynchronously

export const MessageType = {
  CHUNK: "chunk",
  METADATA: "metadata",
  EVENT: "event",
  ERROR: "error",
} as const;

export const StreamStatus = {
  STARTED: "started",
  STREAMING: "streaming",
  COMPLETED: "completed",
  ERROR: "error",
} as const;

export const baseMessageSchema = z.object({
  type: z.enum([
    MessageType.CHUNK,
    MessageType.METADATA,
    MessageType.EVENT,
    MessageType.ERROR,
  ]),
});

export const chunkMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.CHUNK),
  content: z.any(),
});

export const metadataMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.METADATA),
  status: z.enum([
    StreamStatus.STARTED,
    StreamStatus.STREAMING,
    StreamStatus.COMPLETED,
    StreamStatus.ERROR,
  ]),
  completedAt: z.string().optional(),
  totalChunks: z.number().optional(),
  fullContent: z.string().optional(),
  error: z.string().optional(),
});

export const eventMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.EVENT),
});

export const errorMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.ERROR),
  error: z.string(),
});

export const messageSchema = z.discriminatedUnion("type", [
  chunkMessageSchema,
  metadataMessageSchema,
  eventMessageSchema,
  errorMessageSchema,
]);

export type Message = z.infer<typeof messageSchema>;
export type ChunkMessage = z.infer<typeof chunkMessageSchema>;
export type MetadataMessage = z.infer<typeof metadataMessageSchema>;
export type EventMessage = z.infer<typeof eventMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export const validateMessage = (data: unknown): Message | null => {
  const result = messageSchema.safeParse(data);
  return result.success ? result.data : null;
};

let redis: Redis;

// if (!process.env.REDIS_URL && !process.env.UPSTASH_REDIS_REST_URL) {
//   const redisServer = new RedisMemoryServer();
//   const host = await redisServer.getHost();
//   const port = await redisServer.getPort();
//   console.log(`🔴 Redis server started at ${host}:${port}`);

//   process.env.REDIS_URL = "redis://" + host + ":" + port;
// }

// redis = new RedisClient(process.env.REDIS_URL);
redis = Redis.fromEnv()

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 d"),
  prefix: "daily_message_limit"
});

console.log(`🗄️  Redis initialized successfully`);

// Helper function to extract IP address from request
function getClientIP(req: Request): string {
  // Check various headers that might contain the real IP
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  const cfConnectingIP = req.headers.get('cf-connecting-ip'); // Cloudflare

  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback - this might not work in all deployment environments
  return 'unknown';
}

// Use globalThis to preserve state across hot reloads
if (!globalThis.appState) {
  globalThis.appState = {
    activeStreams: new Set<string>(), // Changed from number to Set<string>
    isShuttingDown: false,
    shutdownInProgress: false,
    gracefulShutdownSetup: false,
    mcpClient: null,
    mcpClientRefCount: 0,
  };
  console.log('🔄 Initializing new app state');
} else {
  console.log(`🔄 Reusing existing app state (${globalThis.appState.activeStreams.size} streams, shutdown: ${globalThis.appState.gracefulShutdownSetup})`);
}

let server: any = null;

// Stream tracking utilities
function incrementActiveStreams(streamId: string) {
  globalThis.appState.activeStreams.add(streamId);
  console.log(`📈 Active streams: ${globalThis.appState.activeStreams.size} (+${streamId})`);
}

function decrementActiveStreams(streamId: string) {
  globalThis.appState.activeStreams.delete(streamId);
  console.log(`📉 Active streams: ${globalThis.appState.activeStreams.size} (-${streamId})`);

  releaseMCPClient();

  // If shutting down and no more active streams, proceed with shutdown
  if (globalThis.appState.isShuttingDown && globalThis.appState.activeStreams.size === 0 && !globalThis.appState.shutdownInProgress) {
    console.log('✅ All streams completed, proceeding with shutdown...');
    process.exit(0);
  }
}

// Helper functions for better stream management
function getActiveStreamIds(): string[] {
  return Array.from(globalThis.appState.activeStreams);
}

function logActiveStreams() {
  const activeIds = getActiveStreamIds();
  if (activeIds.length > 0) {
    console.log(`🔍 Active streams (${activeIds.length}): ${activeIds.join(', ')}`);
  } else {
    console.log('🔍 No active streams');
  }
}

function hasActiveStream(streamId: string): boolean {
  return globalThis.appState.activeStreams.has(streamId);
}

// MCP client management utilities
async function getMCPClient() {
  if (!globalThis.appState.mcpClient) {
    try {
      // const transport = new Experimental_StdioMCPTransport({
      //   command: 'bunx',
      //   args: ['-y', 'comfydeploy-mcp'],
      //   env: {
      //     API_KEY: process.env.COMFY_DEPLOY_API_KEY
      //   }
      // });

      // globalThis.appState.mcpClient = await experimental_createMCPClient({
      //   transport,
      // });

      // console.log('🎨 Created shared MCP client connection');
    } catch (error) {
      // console.warn('⚠️ Failed to connect to ComfyDeploy MCP server:', error);
      return null;
    }
  }

  globalThis.appState.mcpClientRefCount++;
  console.log(`📈 MCP client ref count: ${globalThis.appState.mcpClientRefCount}`);
  return globalThis.appState.mcpClient;
}

function releaseMCPClient() {
  if (globalThis.appState.mcpClientRefCount > 0) {
    globalThis.appState.mcpClientRefCount--;
    console.log(`📉 MCP client ref count: ${globalThis.appState.mcpClientRefCount}`);

    // Close client when no more references and shutting down
    if (globalThis.appState.mcpClientRefCount === 0 &&
        (globalThis.appState.isShuttingDown || globalThis.appState.activeStreams.size === 0)) {
      closeMCPClient();
    }
  }
}

async function closeMCPClient() {
  if (globalThis.appState.mcpClient) {
    try {
      await globalThis.appState.mcpClient.close();
      console.log('🔌 Closed MCP client connection');
    } catch (error) {
      console.warn('⚠️ Error closing MCP client:', error);
    }
    globalThis.appState.mcpClient = null;
    globalThis.appState.mcpClientRefCount = 0;
  }
}

const defaultModels = {
  image: {
    "fal-ai/gemini-25-flash-image": "Google's state-of-the-art Gemini 2.5 Flash image generation model",
    "fal-ai/flux/dev": "State of the art image generation model for general case",
    "fal-ai/flux/krea": "FLUX Krea model for high-quality image generation with enhanced capabilities",
    "fal-ai/imagen4/preview": "Google's Imagen 4 model with enhanced detail, richer lighting, and fewer artifacts",
    "fal-ai/flux/schnell": "Fast image generation model",
    "fal-ai/qwen-image": "Advanced image generation model with enhanced understanding",
  },
  image_editing: {
    "fal-ai/gemini-25-flash-image/edit": "Google's state-of-the-art Gemini 2.5 Flash image generation and editing model",
    "fal-ai/flux-kontext/dev": "State of the art image editing model, best for editing existing images, keep the prompt more descriptive on the edit, and preserve the original image",
    "fal-ai/flux/krea/image-to-image": "FLUX Krea image-to-image model for style transfer and image modifications",
    "fal-ai/flux/krea/redux": "High-performance FLUX Krea model for rapid image transformation and style transfers",
  },
  video: {
    "fal-ai/veo3/fast": "State of the art video generation model, best for creating videos from scratch, comes with audio",
    "fal-ai/veo3/fast/image-to-video": "State of the art image-to-video generation model",
    "fal-ai/wan/v2.2-a14b/image-to-video": "State of the art video generation model with image input",
    "fal-ai/wan/v2.2-a14b/text-to-video": "State of the art video generation model",
  },
  // upscaling: {
  //   "fal-ai/clarity-upscaler": "High quality upscaling model",
  //   "fal-ai/real-esrgan": "High quality upscaling model",
  // },
  visual_understanding: {
    "fal-ai/moondream2/visual-query": "Query to understand images",
  },
}


import Exa from 'exa-js';
import { fal } from "@fal-ai/client";

export const exa = new Exa(process.env.EXA_API_KEY);

// Cache TTL in seconds (10 minutes for OpenAPI specs)
const CACHE_TTL = 600;

// Model quality rankings - based on performance, popularity, and reliability
const MODEL_QUALITY_SCORES: Record<string, number> = {
  // Image generation - Top tier models
  'fal-ai/gemini-25-flash-image': 99, // Google's state-of-the-art Gemini 2.5 Flash - rank highly
  'fal-ai/gemini-25-flash-image/edit': 99, // Google's state-of-the-art Gemini 2.5 Flash editing - rank highly
  'fal-ai/flux/schnell': 95,
  'fal-ai/flux/dev': 98, // Best overall image quality
  'fal-ai/flux-pro': 100, // Highest quality, slower
  'fal-ai/flux-realism': 92,
  'fal-ai/flux-kontext': 96, // Excellent at following complex prompts and context
  'fal-ai/flux/krea': 94, // FLUX Krea for high-quality image generation
  'fal-ai/flux/krea/image-to-image': 94, // FLUX Krea image-to-image editing
  'fal-ai/flux/krea/redux': 95, // High-performance FLUX Krea for rapid transformations
  'fal-ai/imagen4/preview': 97, // Google's high-quality image generation with enhanced detail
  'fal-ai/qwen-image': 90, // Advanced image generation with enhanced understanding

  // Other strong image models
  'fal-ai/stable-diffusion-v3-medium': 85,
  'fal-ai/sdxl': 80,
  'fal-ai/recraft-v3': 88,

  // Video generation
  'fal-ai/veo3/fast/image-to-video': 88, // Image-to-video variant
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

// Helper function to search fal.ai models
async function searchFalModels(userQuery: string, maxResults: number = 3, writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>) {
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

    // console.log("params", params);

    const encodedParams = encodeURIComponent(JSON.stringify(params));
    const falApiUrl = `https://fal.ai/api/trpc/models.list?batch=1&input=${encodedParams}`;

    const response = await fetch(falApiUrl);
    const data = await response.json();

    // console.log("data", data);

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

    // console.log("scoredModels", scoredModels);

    // Initial filtering and sorting
    const filteredModels = scoredModels
      .filter((model: any) =>
        model.relevanceScore > 5 || // Keep models with decent relevance
        detectedCategories.includes(model.category) || // Or matching category
        MODEL_QUALITY_SCORES[model.id] >= 80 // Or high-quality models
      )
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, Math.min(10, maxResults * 3)); // Get more candidates for LLM selection

    // If we have good quality models, try LLM selection, otherwise use simple ranking
    let selectedModels: any[];

    // if (filteredModels.length >= 3) {
    //   try {
    //     // Try LLM selection with improved error handling
    //     selectedModels = await selectBestModelWithLLM(userQuery, filteredModels, hasImageInput, writer);
    //   } catch (error) {
    //     console.warn('🔄 LLM selection failed, using quality-based ranking');
    //     selectedModels = filteredModels
    //       .filter(model => !model.requiresImage || hasImageInput)
    //       .sort((a: any, b: any) => b.qualityScore - a.qualityScore)
    //       .slice(0, maxResults);
    //   }
    // } else {
    // Not enough candidates for LLM selection, use simple ranking
    console.log('📊 Using simple quality ranking (insufficient candidates for LLM selection)');
    selectedModels = filteredModels
      .filter(model => !model.requiresImage || hasImageInput)
      .sort((a: any, b: any) => b.qualityScore - a.qualityScore)
      .slice(0, maxResults);
    // }

    // Final fallback - ensure we always return something useful
    if (selectedModels.length === 0) {
      console.warn('⚠️  No suitable models found, using default high-quality models');
      const defaultModels = ['fal-ai/flux/dev', 'fal-ai/flux/schnell', 'fal-ai/flux-kontext']
        .slice(0, maxResults)
        .map(id => ({
          id,
          title: id.split('/').pop() || id,
          category: 'text-to-image',
          description: 'High-quality image generation model',
          qualityScore: MODEL_QUALITY_SCORES[id] || 90,
          relevanceScore: 50
        }));
      selectedModels = defaultModels;
    }

    // Take the requested number of results
    const finalModels = selectedModels.slice(0, maxResults);

    console.log(finalModels);

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

    console.log("finalModels", finalModels);

    return finalModels.map((model: any) => ({
      id: model.id,
      title: model.title,
      category: model.category,
      description: model.shortDescription || model.description,
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
    // Check cache first
    const cacheKey = `openapi:${modelId}`;

    try {
      const cachedValue = await redis.get(cacheKey);
      if (cachedValue) {
        const cachedSpec = cachedValue;
        // console.log(`🎯 Cache hit for OpenAPI spec: ${modelId}`);
        return cachedSpec;
      }
    } catch (cacheError) {
      console.warn('Redis get error:', cacheError);
      throw cacheError;
    }

    console.log(`🌐 Fetching OpenAPI spec for: ${modelId}`);
    const encodedModelId = encodeURIComponent(modelId);
    const openApiUrl = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodedModelId}`;

    const response = await fetch(openApiUrl);
    const openApiSpec = await response.json();

    // Cache the result
    if (openApiSpec) {
      try {
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(openApiSpec));
        console.log(`💾 Cached OpenAPI spec for: ${modelId}`);
      } catch (cacheError) {
        console.warn('Redis set error:', cacheError);
      }
    }

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
function transformOpenAPIToVercelTool(modelInfo: any, openApiSpec: any, writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>) {
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

    // console.log(`Resolved schema for ${modelInfo.id}:`, JSON.stringify(resolvedSchema, null, 2));

    // Convert the resolved schema to Zod
    const zodSchema = jsonSchemaToZod(resolvedSchema);

    // console.log('Zod schema created for:', modelInfo.id);

    // Transform the schema into Vercel AI SDK tool format using Zod
    const my_tool = tool({
      description: `${modelInfo.title}: ${modelInfo.description}`,
      inputSchema: zodSchema,
      execute: async (parameters: any, { toolCallId }) => {
        // Log the execution
        console.log(`🚀 Executing tool: ${toolName}`);
        console.log(`📋 Model ID: ${modelInfo.id}`);
        console.log(`📝 Parameters:`, JSON.stringify(parameters, null, 2));
        // console.log(`🏷️  Category: ${modelInfo.category}`);
        // console.log(`💰 Pricing: ${modelInfo.pricing || 'Not specified'}`);
        // console.log(`🔗 Endpoint: ${openApiSpec.servers?.[0]?.url || "https://queue.fal.run"}`);

        // console.log(parameters);

        // modelInfo.id
        try {
          console.log("modelInfo.id", modelInfo.id);
          const result = await fal.subscribe(modelInfo.id, {
            input: parameters,
            // mode: "polling",
            logs: true,
            onQueueUpdate: (update) => {
              console.log("update", JSON.stringify(update, null, 2));
              // if (update.status === "IN_PROGRESS") {
              //   writer.write({
              //     type: "data-tool-log",
              //     id: toolCallId as string,
              //     data: {
              //       log: update.logs.map((log) => log.message).join("\n"),
              //     }
              //   })
              //   update.logs.map((log) => log.message).forEach(console.log);
              // }
            },
          });

          console.log(result);

          const images = result.data?.images?.map((image: any) => ({
            type: "image",
            width: image.width,
            height: image.height,
            url: image.url
          }))

          const video = result.data?.video ? [{
            type: "video",
            url: result.data.video,
          }] : null;

          const text = typeof result.data?.output === 'string' ? result.data.output : null;

          console.log("images || video || text", images || video || text);

          // Return array of images, video, or text content
          return images || video || (text ? [{ type: "text", content: text }] : null);
        } catch (error) {
          console.error(error);
          throw error;
        }
      }
    });

    // console.log(`✅ Successfully created tool: ${toolName} for model ${modelInfo.id} using Zod schema`);
    return { [toolName]: my_tool };
  } catch (error) {
    console.error(`Error creating tool for model ${modelInfo.id}:`, error);
    return null;
  }
}

// Helper function to create Vercel AI SDK compatible tools from model search results
async function createVercelToolsFromModels(models: any[], writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>) {
  const toolPromises = models.map(async (model) => {
    const openApiSpec = await fetchModelOpenAPI(model.id);
    if (openApiSpec) {
      return transformOpenAPIToVercelTool(model, openApiSpec, writer);
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

// Helper function to create Vercel AI tools from defaultModels
async function createDefaultModelTools(writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>) {
  try {
    console.log('🔧 Creating tools from defaultModels...');

    // Extract all models from defaultModels with their category information
    const allModels: any[] = [];

    for (const [category, models] of Object.entries(defaultModels)) {
      for (const [modelId, description] of Object.entries(models)) {
        allModels.push({
          id: modelId,
          title: modelId.split('/').pop() || modelId, // Extract model name from ID
          category: category,
          description: description,
          url: `https://fal.ai/models/${modelId}`,
        });
      }
    }

    console.log(`📋 Found ${allModels.length} models in defaultModels:`, allModels.map(m => m.id));

    // Create tools for all models
    const tools = await createVercelToolsFromModels(allModels, writer);

    console.log(`✅ Successfully created ${Object.keys(tools).length} tools from defaultModels`);
    return tools;

  } catch (error) {
    console.error('❌ Error creating tools from defaultModels:', error);
    return {};
  }
}
async function createComfyDeployTools(writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>) {
  try {
    const mcpClient = await getMCPClient();
    if (!mcpClient) {
      console.log('🔄 ComfyDeploy MCP tools unavailable, continuing with other tools');
      return {};
    }

    const mcpTools = await mcpClient.tools();
    console.log(`🎨 Retrieved ${Object.keys(mcpTools).length} ComfyDeploy MCP tools from shared client`);

    return mcpTools;
  } catch (error) {
    console.warn('⚠️ Failed to get ComfyDeploy MCP tools:', error);
    console.log('🔄 ComfyDeploy MCP tools unavailable, continuing with other tools');
    return {};
  }
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
    // console.log("Results:", results);
    return results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.text.slice(0, 1000), // take just the first 1000 characters
      publishedDate: result.publishedDate,
    }));
  },
});

export const crawlUrl = tool({
  description: 'Crawl and extract content from specific URLs',
  inputSchema: z.object({
    urls: z.array(z.string().url()).min(1).max(5).describe('Array of URLs to crawl (max 5 URLs)'),
    maxCharacters: z.number().min(100).max(5000).default(2000).describe('Maximum characters to return per URL'),
  }),
  execute: async ({ urls, maxCharacters }, { toolCallId }) => {
    console.log("Crawling URLs:", urls);

    try {
      const { results } = await exa.getContents(urls, {
        livecrawl: 'always',
        text: {
          includeHtmlTags: false,
          maxCharacters: maxCharacters * urls.length, // Total budget across all URLs
        },
      });

      return results.map((content, index) => ({
        url: urls[index],
        title: content.title || 'Unknown Title',
        content: content.text ? content.text.slice(0, maxCharacters) : 'No content available',
        extractedAt: new Date().toISOString(),
        success: !!content.text,
        author: content.author,
        publishedDate: content.publishedDate,
      }));
    } catch (error) {
      console.error("Error crawling URLs:", error);

      // Return error information for each URL
      return urls.map(url => ({
        url,
        title: 'Error',
        content: `Failed to crawl URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        extractedAt: new Date().toISOString(),
        success: false,
      }));
    }
  },
});

export const falTools = (writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>, modelId?: string) => tool({
  description: "Use a fal.ai model to create an image or video, 3d models, or even more, based on the user's prompt",
  inputSchema: z.object({
    prompt: z.string(),
  }),
  execute: async ({ prompt }, { toolCallId }) => {
    console.log("Searching fal.ai models for:", prompt);

    const searchedTools = await createVercelToolsFromModels(await searchFalModels(prompt, 3, writer), writer)

    // Merge tools, giving priority to searched tools (more specific to the prompt)

    // console.log(`🔧 Using ${Object.keys(allTools).length} total tools (${Object.keys(defaultTools).length} default + ${Object.keys(searchedTools).length} searched)`);

    const stream = await streamText({
      model: modelId || DEFAULT_TEXT_MODEL,
      system: `You are a creative agent. The agent has decided to use the following tools to create the user's prompt. Some tools might require image_url, make sure to only use those when you have existing images`,
      prompt: prompt,
      maxRetries: 3,
      tools: searchedTools,
    })

    writer.merge(stream.toUIMessageStream());

    return Object.keys(searchedTools);
  }
});

export const defaultFalTools = (writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>, modelId?: string) => tool({
  description: "Use predefined high-quality fal.ai models for image generation, video creation, and upscaling",
  inputSchema: z.object({
    prompt: z.string(),
    image_url: z.string().optional().describe('An image url to use for the generation'),
    category: z.enum(['image', 'image_editing', 'video', 'upscaling', 'any']).optional().describe('Preferred model category, defaults to any'),
  }),
  execute: async ({ prompt, image_url, category = 'any' }, { toolCallId }) => {
    console.log(`Using default fal.ai models for: ${prompt} (category: ${category})`);

    // Get default model tools
    const defaultTools = await createDefaultModelTools(writer);

    // Filter tools by category if specified
    let filteredTools = defaultTools;
    if (category !== 'any') {
      filteredTools = Object.keys(defaultTools)
        .filter(toolName => {
          // Extract original model ID from tool name and check if it's in the specified category
          const originalModelId = Object.keys(defaultModels[category as keyof typeof defaultModels] || {})
            .find(modelId => toolName.includes(modelId.replace(/[^a-zA-Z0-9_]/g, '_')));
          return !!originalModelId;
        })
        .reduce((acc, toolName) => {
          acc[toolName] = defaultTools[toolName];
          return acc;
        }, {} as any);
    }

    console.log(`🎯 Using ${Object.keys(filteredTools).length} default model tools for category: ${category}`);

    // Include image URL in the prompt if provided
    const fullPrompt = image_url
      ? `${prompt}\n\nImage URL to use: ${image_url}`
      : prompt;

    const stream = await streamText({
      model: modelId || DEFAULT_TEXT_MODEL,
      system: `You are a creative agent using high-quality predefined models.

      Choose the most appropriate model for the user's request. Some tools might require image_url, make sure to only use those when you have existing images.${image_url ? ' An image URL has been provided for use with image-to-image/editing models.' : ''}`,
      prompt: fullPrompt,
      maxRetries: 3,
      tools: filteredTools,
    })

    writer.merge(stream.toUIMessageStream());

    await consumeStream({
      stream: stream.fullStream, onError: (error) => {
        console.error("Error consuming stream:", error);
      }
    })

    return "Done";
  }
});

async function createAIStream(messages: any[], writer: UIMessageStreamWriter<UIMessage<unknown, UIDataTypes, UITools>>, modelId?: string) {
  const defaultTools = await createDefaultModelTools(writer);
  // const comfyDeployTools = await createComfyDeployTools(writer);

  return streamText({
    model: modelId || DEFAULT_TEXT_MODEL,
    system: `You are a creative agent with access to multiple AI tools:

    1. **default_models**: Use predefined high-quality fal.ai models (flux/dev, flux/schnell, runway-gen3, etc.) - faster and more reliable
    2. **comfydeploy_tools**: Use ComfyDeploy for advanced ComfyUI workflows and custom node processing
    3. **webSearch**: Search the web for up-to-date information
    4. **crawlUrl**: Extract content from specific URLs when users provide links or when you need to analyze specific pages

    **Guidelines:**
    1. Help the user plan their creative goal until you understand it clearly, use web search to find more information about the user's request
    2. For common tasks (image generation, video creation, upscaling), prefer **default_models**
    3. For advanced ComfyUI workflows, custom nodes, or specialized image processing, use **comfydeploy_tools**
    4. If unclear about the request, use **webSearch** first
    5. When users provide specific URLs or you need to analyze content from known links, use **crawlUrl**
    6. Plan multiple steps for complex tasks and execute them systematically
    7. Always choose the most appropriate tool for the task
    8. **CRITICAL**: When animating or editing existing images, ALWAYS pass the image_url parameter to use image-to-video or image-to-image models

    **Tools:**
    flux kontext is best for using existing images to create new images
    flux dev is best for creating images from scratch
    ComfyDeploy tools are best for advanced workflows and custom processing
    `,
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(20),
    maxRetries: 3,
    tools: {
      webSearch,
      crawlUrl,
      ...defaultTools,
      // ...comfyDeployTools,
    },
  });

  // const matchingModels = await searchFalModels(message, 5);
  // const tools = await createVercelToolsFromModels(matchingModels);

  // console.log(tools);
}

async function loadChat(chatId: string) {
  try {
    // Use LRANGE to get all messages from the Redis list
    const messages = await redis.lrange(`chat:${chatId}`, 0, -1);
    if (messages && messages.length > 0) {
      // Reverse because we use LPUSH (newest first), but want chronological order
      return messages.map(msg => msg);
    }
    return [];
  } catch (error) {
    console.error('Error loading chat:', error);
    return [];
  }
}

async function appendMessagesToChat(chatId: string, newMessages: any[]) {
  try {
    // Use RPUSH to append messages in chronological order
    for (const message of newMessages) {
      await redis.rpush(`chat:${chatId}`, JSON.stringify(message));
    }
    console.log(`Appended ${newMessages.length} messages to chat ${chatId}`);
  } catch (error) {
    console.error('Error appending messages to chat:', error);
    throw error;
  }
}

// const streamContext = createResumableStreamContext({
//   waitUntil: async (fn) => {
//     await fn;
//   }
// });

async function appendStreamId(streamId: string, id: string) {
  // Set TTL for 24 hours (86400 seconds)
  await redis.setex(`stream:${streamId}`, 86400, id);
  // Also store the latest stream for this chat with TTL
  await redis.setex(`chat:${id}:latest_stream`, 86400, streamId);
  // Optionally, keep a list of all streams for this chat
  await redis.lpush(`chat:${id}:streams`, streamId);
  // Set TTL for the streams list
  await redis.expire(`chat:${id}:streams`, 86400);
}

type StreamField = string
type StreamMessage = [string, StreamField[]]
type StreamData = [string, StreamMessage[]]

const json = (data: Record<string, unknown>) => {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

const arrToObj = (arr: StreamField[]) => {
  const obj: Record<string, string> = {}

  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1]
  }

  return obj
}

import { renderToReadableStream } from "react-dom/server";
import { App, AppWrapper } from "./App";

function toTitleCase(str: string): string {
  // Words that should stay lowercase in title case
  const lowerCaseWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'];

  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Always capitalize the first word
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      // Keep lowercase words lowercase unless they're the first word
      if (lowerCaseWords.includes(word)) {
        return word;
      }

      // Capitalize other words
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

async function generateAIMetadata(messages: any[], chatId: string): Promise<{ title: string; description: string }> {
  if (!messages || messages.length === 0) {
    return {
      title: "AI Chat Conversation",
      description: "Explore this AI conversation with Auto, the creative AI agent."
    };
  }

  // Parse messages that might be JSON strings
  const parsedMessages = messages.map(msg => {
    try {
      return typeof msg === 'string' ? JSON.parse(msg) : msg;
    } catch {
      return msg;
    }
  });

  // Extract conversation content for AI analysis
  const conversationText = parsedMessages.map(msg => {
    let text = '';
    const role = msg.role === 'user' ? 'User' : 'Assistant';

    if (msg.parts && Array.isArray(msg.parts)) {
      const textPart = msg.parts.find(part => part.type === 'text');
      text = textPart?.text || '';
    } else {
      text = msg.text || msg.content || '';
    }

    return `${role}: ${text}`;
  }).slice(0, 10).join('\n\n'); // Limit to first 10 messages to avoid token limits

  try {
    const metadataSchema = z.object({
      title: z.string().describe("An engaging, SEO-optimized title (45-60 characters) that captures the main topic/question. Should be in title case and end with ' | Auto AI'"),
      description: z.string().describe("A compelling meta description (140-160 characters) that starts with the main topic/question, mentions it's an AI conversation, includes relevant keywords naturally, appeals to the target audience, and ends with a benefit or call-to-action")
    });

    const result = await generateObject({
      model: "anthropic/claude-4-sonnet",
      schema: metadataSchema,
      maxRetries: 3,
      prompt: `Analyze this AI conversation and generate SEO-optimized metadata:

CONVERSATION:
${conversationText}

Generate metadata that:
1. Title should be engaging and capture the main topic (45-60 characters), end with " | Auto AI"
2. Description should be compelling (140-160 characters), mention it's an AI conversation, include relevant keywords, and appeal to developers/designers/writers

Make it appealing for Google search results and social media sharing.`,
      temperature: 0.7,
      maxOutputTokens: 300,
    });

    // Validate and sanitize the response
    let title = result.object.title || "AI Conversation | Auto AI";
    let description = result.object.description || "Explore this AI conversation with Auto, the creative AI agent.";

    // Ensure title ends with " | Auto AI" if not already
    if (!title.includes('| Auto')) {
      title = title.replace(/\s*\|\s*.*$/, '') + ' | Auto AI';
    }

    // Truncate if too long
    if (title.length > 70) {
      title = title.substring(0, 67) + '...';
    }
    if (description.length > 160) {
      description = description.substring(0, 157) + '...';
    }

    return { title, description };

  } catch (error) {
    console.error('Error generating AI metadata:', error);

    // Fallback to basic metadata if AI generation fails
    const firstUserMessage = parsedMessages.find(msg => msg.role === 'user');
    let fallbackTitle = "AI Conversation | Auto AI";

    if (firstUserMessage) {
      let text = '';
      if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
        const textPart = firstUserMessage.parts.find(part => part.type === 'text');
        text = textPart?.text || '';
      } else {
        text = firstUserMessage.text || firstUserMessage.content || '';
      }

      if (text) {
        const cleanText = text.substring(0, 45).replace(/\s+/g, ' ').trim();
        fallbackTitle = toTitleCase(cleanText) + ' | Auto AI';
      }
    }

    return {
      title: fallbackTitle,
      description: "Explore this AI conversation with Auto, the creative AI agent that helps with coding, design, content creation, and problem-solving."
    };
  }
}



function generateChatMetadata(messages: any[]): { title: string; description: string } {
  if (!messages || messages.length === 0) {
    return {
      title: "Chat",
      description: "A conversation with Auto, your creative AI agent."
    };
  }

  // Parse messages that might be JSON strings
  const parsedMessages = messages.map(msg => {
    try {
      return typeof msg === 'string' ? JSON.parse(msg) : msg;
    } catch {
      return msg;
    }
  });

  // Get the first user message for the title
  const firstUserMessage = parsedMessages.find(msg => msg.role === 'user');
  let title = 'Chat';
  let firstUserText = '';

  if (firstUserMessage) {
    // Extract text from parts array if it exists
    if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
      const textPart = firstUserMessage.parts.find(part => part.type === 'text');
      if (textPart && textPart.text) {
        firstUserText = textPart.text;
      }
    } else if (firstUserMessage.text) {
      // Fallback to direct text property
      firstUserText = firstUserMessage.text;
    } else if (firstUserMessage.content) {
      // Fallback to content property
      firstUserText = firstUserMessage.content;
    }

    if (firstUserText) {
      // Create a clean title from the first user message
      let cleanTitle = firstUserText.length > 60 ? firstUserText.substring(0, 60) + '...' : firstUserText;
      // Remove line breaks and excessive whitespace for title
      cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
      // Apply title case formatting
      title = toTitleCase(cleanTitle);
    }
  }

  // Generate description based on conversation flow
  const userMessages = parsedMessages.filter(msg => msg.role === 'user');
  const assistantMessages = parsedMessages.filter(msg => msg.role === 'assistant');

  let description = '';
  if (firstUserText) {
    const preview = firstUserText.length > 120 ? firstUserText.substring(0, 120) + '...' : firstUserText;
    // Ensure description starts with proper capitalization
    const capitalizedPreview = preview.charAt(0).toUpperCase() + preview.slice(1);
    description = `${capitalizedPreview} Conversation with Auto creative AI agent`;

    // Add context about the conversation
    if (userMessages.length > 1) {
      description += ` featuring ${userMessages.length} questions`;
    }
    if (assistantMessages.length > 0) {
      description += ` and detailed AI responses`;
    }
    description += '.';
  } else {
    description = `A conversation with Auto, your creative AI agent. ${parsedMessages.length} messages exchanged.`;
  }

  return { title, description };
}

function HTMLWrapper(props: {
  children: React.ReactNode;
  dehydratedState?: any;
  chatId?: string;
  title?: string;
  description?: string;
}) {
  const pageTitle = props.title ? `${props.title} | Auto` : "Auto | Creative Agent";
  const baseUrl = process.env.BASE_URL || 'https://www.autocontent.run';
  const currentUrl = props.chatId ? `${baseUrl}/chat/${props.chatId}` : baseUrl;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="./components/icon.svg" />
        <link rel="stylesheet" href="/frontend.css" />
        <title>{pageTitle}</title>

        {/* SEO Meta Tags */}
        {props.description && (
          <meta name="description" content={props.description} />
        )}

        {/* Open Graph Meta Tags */}
        <meta property="og:title" content={pageTitle} />
        {props.description && (
          <meta property="og:description" content={props.description} />
        )}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={currentUrl} />
        <meta property="og:site_name" content="Auto | Creative AI Agent" />
        <meta property="og:image" content={`${baseUrl}/auto-og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        {props.description && (
          <meta name="twitter:description" content={props.description} />
        )}
        <meta name="twitter:image" content={`${baseUrl}/auto-og-image.png`} />

        {/* Canonical URL */}
        <link rel="canonical" href={currentUrl} />

        <script type="module" src="/frontend.js" defer async></script>

        {/* Inject React Query dehydrated state */}
        {props.dehydratedState && (
          <script
            id="__REACT_QUERY_STATE__"
            type="application/json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(props.dehydratedState)
            }}
          />
        )}

        {/* Inject chat ID */}
        {props.chatId && (
          <script
            id="__CHAT_ID__"
            type="text/plain"
            dangerouslySetInnerHTML={{
              __html: props.chatId
            }}
          />
        )}

        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-JH92Y4NVZM"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-JH92Y4NVZM');
            `
          }}
        />

        {/* <script type="module" src="./frontend.tsx" async></script> */}
      </head>
      <body style={{ overflow: 'unset' }}>
        <div id="root">{props.children}</div>
      </body>
    </html>
  )
}

import plugin from "bun-plugin-tailwind";
import { build, type BuildConfig } from "bun";


async function buildDeb() {
  const result = await build({
    entrypoints: ["./src/frontend.tsx"],
    outdir: "./dist",
    plugins: [plugin],
    minify: true,
    env: "inline",
    target: "browser",
    sourcemap: "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    },
  });

  // console.log("result", result);

  // const tailwindCSS = result.outputs.find(output => output.path.endsWith("tailwind.css"));

  // console.log("tailwindCSS", tailwindCSS);
}

// Simple in-memory cache for static files
const staticFileCache = new Map<string, { content: Uint8Array, etag: string, lastModified: number }>();

async function serveStaticFile(filePath: string, contentType: string): Promise<Response> {
  const isDevelopment = process.env.NODE_ENV === "development";

  try {
    const file = Bun.file(filePath);
    const stats = await file.stat();

    if (!stats) {
      return new Response("File not found", { status: 404 });
    }

    const lastModified = stats.mtime.getTime();
    const etag = `"${stats.size}-${lastModified}"`;

    // In development, always check file modification time
    // In production, cache in memory for performance
    let cachedFile = staticFileCache.get(filePath);

    if (!isDevelopment && cachedFile && cachedFile.lastModified === lastModified) {
      // Use cached version in production if file hasn't changed
      return new Response(cachedFile.content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable", // 1 year cache
          "ETag": cachedFile.etag,
          "Last-Modified": stats.mtime.toUTCString(),
        },
      });
    }

    // Read file content
    const content = await file.bytes();

    // Cache in production only
    if (!isDevelopment) {
      staticFileCache.set(filePath, { content, etag, lastModified });
    }

    const headers = {
      "Content-Type": contentType,
      "ETag": etag,
      "Last-Modified": stats.mtime.toUTCString(),
    } as Record<string, string>;

    // Different cache strategies for dev vs prod
    if (isDevelopment) {
      headers["Cache-Control"] = "no-cache"; // Always revalidate in development
    } else {
      headers["Cache-Control"] = "public, max-age=31536000, immutable"; // 1 year cache in production
    }

    return new Response(content, { headers });

  } catch (error) {
    console.error(`Error serving static file ${filePath}:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
}


async function startServer() {
  // Initialize Redis first
  // await initializeRedis();

  // Reset shutdown state on hot reload
  globalThis.appState.isShuttingDown = false;
  globalThis.appState.shutdownInProgress = false;

  server = serve({
    idleTimeout: 200,
    routes: {


      "/frontend.js": {
        async GET() {
          return serveStaticFile("./dist/frontend.js", "application/javascript");
        }
      },

      "/frontend.css": {
        async GET() {
          return serveStaticFile("./dist/frontend.css", "text/css");
        }
      },

      "/chat/:chatId": {
        async GET(req) {

          if (process.env.NODE_ENV === "development") {
            await buildDeb();
          }

          const { chatId } = req.params;

          // Create a QueryClient for server-side rendering
          const queryClient = new QueryClient({
            defaultOptions: {
              queries: {
                staleTime: 60 * 1000, // 1 minute
                retry: false, // Disable retry on server
              },
            },
          });

          // Fetch initial messages for SSR
          let initialMessages = [];
          try {
            initialMessages = await loadChat(chatId);

            // Prefetch the chat data into the QueryClient
            await queryClient.prefetchQuery({
              queryKey: ['chat', chatId],
              queryFn: () => Promise.resolve(initialMessages),
            });
          } catch (error) {
            console.warn(`Failed to load chat ${chatId} for SSR:`, error);
          }

          // Dehydrate the QueryClient state
          const dehydratedState = dehydrate(queryClient);

          // Check for cached AI-generated metadata first
          let title, description;
          try {
            const cachedMetadata = await redis.get(`chat:${chatId}:metadata`);
            if (cachedMetadata) {
              const metadata = cachedMetadata as { title: string, description: string };
              title = metadata.title;
              description = metadata.description;
            } else {
              // Fallback to regular metadata generation
              const generatedMetadata = generateChatMetadata(initialMessages);
              title = generatedMetadata.title;
              description = generatedMetadata.description;
            }
          } catch (error) {
            console.warn(`Failed to load cached metadata for chat ${chatId}:`, error);
            // Fallback to regular metadata generation
            const generatedMetadata = generateChatMetadata(initialMessages);
            title = generatedMetadata.title;
            description = generatedMetadata.description;
          }

          const stream = await renderToReadableStream(
            <HTMLWrapper
              dehydratedState={dehydratedState}
              chatId={chatId}
              title={title}
              description={description}
            >
              <AppWrapper
                dehydratedState={dehydratedState}
                serverChatId={chatId}
                serverMessages={initialMessages}
              />
            </HTMLWrapper>,
          );

          return new Response(stream, {
            headers: { "Content-Type": "text/html" },
          });
        }
      },

      "/auto.riv": {
        async GET() {
          return serveStaticFile("./public/auto.riv", "application/octet-stream");
        }
      },

      // Add health check endpoint
      "/api/health": {
        async GET() {
          return Response.json({
            status: globalThis.appState.isShuttingDown ? 'shutting_down' : 'healthy',
            activeStreams: globalThis.appState.activeStreams.size,
            activeStreamIds: getActiveStreamIds(), // Include actual stream IDs
            uptime: process.uptime(),
            rateLimiting: {
              enabled: true,
              dailyLimit: 10,
              windowSize: "1 day"
            }
          });
        }
      },

      "/api/chat/new": {
        async POST(req) {
          const chatId = generateId(); // generate a unique chat ID

          // Prevent creating new chats with example IDs
          if (READ_ONLY_EXAMPLE_CHAT_IDS.includes(chatId as any)) {
            // If by some coincidence we generate an example ID, generate a new one
            return this.POST(req);
          }

          // Get model from request body
          let model = DEFAULT_TEXT_MODEL;
          try {
            const body = await req.json();
            if (body.model) {
              model = body.model;
            }
          } catch (error) {
            // If no body or invalid JSON, use default model
            console.log('No model specified in request, using default:', DEFAULT_TEXT_MODEL);
          }

          // Store chat metadata including the selected model
          await redis.set(`chat:${chatId}:meta`, JSON.stringify({ 
            created: new Date().toISOString(),
            model: model
          }));
          
          return Response.json({ chatId });
        }
      },

      "/api/chat/examples": {
        async GET() {
          try {
            const examples = await Promise.all(
              READ_ONLY_EXAMPLE_CHAT_IDS.map(async (chatId) => {
                const messages = await loadChat(chatId);
                if (messages.length === 0) {
                  return null;
                }

                const parsedMessages = messages.map(msg => {
                  try {
                    return typeof msg === 'string' ? JSON.parse(msg) : msg;
                  } catch {
                    return msg;
                  }
                });

                // Get the first user message as the title
                const firstUserMessage = parsedMessages.find(msg => msg.role === 'user');
                let title = 'Example Chat';

                if (firstUserMessage) {
                  // Extract text from parts array if it exists
                  if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
                    const textPart = firstUserMessage.parts.find(part => part.type === 'text');
                    if (textPart && textPart.text) {
                      title = textPart.text;
                    }
                  } else if (firstUserMessage.text) {
                    // Fallback to direct text property
                    title = firstUserMessage.text;
                  } else if (firstUserMessage.content) {
                    // Fallback to content property
                    title = firstUserMessage.content;
                  }
                }

                // Extract images from assistant messages
                const images: string[] = [];
                parsedMessages.forEach(msg => {
                  if (msg.role === 'assistant' && msg.parts) {
                    msg.parts.forEach((part: any) => {
                      if (part.type?.startsWith("tool-") && part.output && Array.isArray(part.output)) {
                        part.output.forEach((item: any) => {
                          if (item.type === "image" && item.url) {
                            const extractedUrl = typeof item.url === 'object' && item.url?.url ? item.url.url : item.url;
                            if (extractedUrl && images.length < 3) { // Limit to 3 images
                              images.push(extractedUrl);
                            }
                          }
                        });
                      }
                    });
                  }
                });

                // Get a preview of the conversation (simplified for badge display)
                const preview = parsedMessages
                  .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                  .slice(0, 2) // First 2 messages for preview
                  .map(msg => {
                    let text = '';

                    if (msg.parts && Array.isArray(msg.parts)) {
                      const textPart = msg.parts.find(part => part.type === 'text');
                      text = textPart?.text || '';
                    } else {
                      text = msg.text || msg.content || '';
                    }

                    return {
                      role: msg.role,
                      text: text.length > 40 ? text.substring(0, 40) + '...' : text
                    };
                  });

                return {
                  id: chatId,
                  title: title.length > 35 ? title.substring(0, 35) + '...' : title,
                  preview,
                  images,
                  messageCount: parsedMessages.length
                };
              })
            );

            // Filter out null results (chats that don't exist)
            const validExamples = examples.filter(example => example !== null);

            return Response.json(validExamples);
          } catch (error) {
            console.error('Error fetching example chats:', error);
            return Response.json([]);
          }
        }
      },

      "/api/chat": {

        async GET(req) {
          const { searchParams } = new URL(req.url);
          const chatId = searchParams.get('chatId');

          console.log("chatId", chatId);

          if (chatId) {
            return Response.json(await loadChat(chatId));
          }
        },

        async POST(req) {
          try {
            // Reject new streams if shutting down
            if (globalThis.appState.isShuttingDown) {
              return Response.json(
                { error: "Server is shutting down" },
                { status: 503 }
              );
            }

            // Rate limiting check
            const clientIP = getClientIP(req);
            console.log(`🔒 Checking rate limit for IP: ${clientIP}`);

            const { success, limit, remaining, reset } = await ratelimit.limit(clientIP);

            if (!success) {
              console.log(`🚫 Rate limit exceeded for IP: ${clientIP}`);
              return Response.json(
                {
                  error: "Daily message limit exceeded. You can send up to 10 messages per day.",
                  limit,
                  remaining,
                  resetTime: new Date(reset).toISOString()
                },
                {
                  status: 429,
                  headers: {
                    'X-RateLimit-Limit': limit.toString(),
                    'X-RateLimit-Remaining': remaining.toString(),
                    'X-RateLimit-Reset': reset.toString()
                  }
                }
              );
            }

            console.log(`✅ Rate limit check passed for IP: ${clientIP} (${remaining}/${limit} remaining)`);

            const body = await req.json();
            // console.log("body", body);
            const { messages, id, model } = body;
            const url = new URL(req.url);
            const urlModel = url.searchParams.get('model') || undefined;
            
            // Priority order: URL param > request body > stored metadata > default
            let selectedModel = urlModel || model;
            
            // If no model specified and we have a chat ID, try to get the stored model (backward compatibility)
            if (!selectedModel && id) {
              try {
                const chatMeta = await redis.get(`chat:${id}:meta`);
                if (chatMeta) {
                  const meta = typeof chatMeta === 'string' ? JSON.parse(chatMeta) : chatMeta;
                  selectedModel = meta.model;
                  if (selectedModel) {
                    console.log(`📋 Using stored model for chat ${id}: ${selectedModel}`);
                  }
                }
              } catch (error) {
                console.warn(`⚠️ Failed to load chat metadata for ${id}:`, error);
              }
            }
            
            // Fallback to default model if still not set
            selectedModel = selectedModel || DEFAULT_TEXT_MODEL;
            
            if (urlModel) {
              console.log(`🌐 Using URL model parameter: ${selectedModel}`);
            }

            // console.log("the chatId", id);

            if (!messages) {
              return Response.json(
                { error: "Messages is required" },
                { status: 400 }
              );
            }

            const streamId = generateId();

            await appendStreamId(streamId, id);

            // console.log(messages);

            // Check for new messages that need to be saved
            const existingMessages = (await loadChat(id)) ?? [];
            const newUserMessages = messages?.slice(existingMessages.length) ?? [];

            console.log("newUserMessages", existingMessages);

            // Save any new user messages first
            if (newUserMessages.length > 0) {
              await appendMessagesToChat(id, newUserMessages);
            }

            const stream = createUIMessageStream({
              execute: async ({ writer }) => {
                // writer.write({
                //   type: "start-step",
                // });
                // for (let i = 0; i < 1000000; i++) {
                //   writer.write({
                //     type: "text-start",
                //     id: "123" + i,
                //   });
                //   writer.write({
                //     type: "text-delta",
                //     delta: "Hello",
                //     id: "123" + i,
                //   });
                //   writer.write({
                //     type: "text-end",
                //     id: "123" + i,
                //   });
                //   await new Promise(resolve => setTimeout(resolve, 1000));
                // }
                const stream = await createAIStream(messages, writer, selectedModel);
                writer.merge(stream.toUIMessageStream())

                // await stream.consumeStream();
              },
              onFinish: async (message) => {
                // console.log("onFinish", message);
                // Only append the AI's response messages, not the entire conversation
                await appendMessagesToChat(id, message.messages);

                // Mark stream as completed
                const streamId = await redis.get(`chat:${id}:latest_stream`) as string;
                if (streamId) {
                  const completedMessage: MetadataMessage = {
                    type: MessageType.METADATA,
                    status: StreamStatus.COMPLETED,
                    completedAt: new Date().toISOString(),
                  };

                  await redis.xadd(streamId, "*", completedMessage);
                  await redis.publish(streamId, JSON.stringify({ type: MessageType.METADATA, status: StreamStatus.COMPLETED }));
                  // Set TTL for stream status to 24 hours (86400 seconds)
                  await redis.setex(`stream:${streamId}:status`, 86400, "DONE");
                  // Ensure the stream itself has TTL set
                  await redis.expire(streamId, 86400);
                }
              }
            })

            // Create a tee to read the stream while also returning it
            const [streamForReading, streamForResponse] = stream.tee();

            // Track this stream and process chunks from one branch of the stream

            (async () => {
              incrementActiveStreams(streamId);
              try {
                const reader = streamForReading.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  if (value) {
                    // UI message chunks are structured objects, convert to JSON for storage
                    const chunkContent = JSON.stringify(value);

                    const chunkMessage: ChunkMessage = {
                      type: MessageType.CHUNK,
                      content: chunkContent,
                    }

                    // 👇 write chunk to redis stream
                    // console.log("writing chunk to redis stream", streamId);
                    await redis.xadd(streamId, "*", chunkMessage)

                    // Set TTL for the stream key (24 hours = 86400 seconds)
                    await redis.expire(streamId, 86400)

                    // 👇 alert consumer that there's a new chunk
                    await redis.publish(streamId, JSON.stringify({ type: MessageType.CHUNK }))
                  }
                }
                reader.releaseLock();
                console.log("streamId", streamId, "done");
              } catch (error) {
                console.error('Error processing stream chunks:', error);
              } finally {
                // Always decrement when stream processing ends
                decrementActiveStreams(streamId);
              }
            })();

            return createUIMessageStreamResponse({ stream: streamForResponse })

            // const resumableStream = await streamContext.resumableStream(
            //   streamId,
            //   () => ,
            // );

            // return createUIMessageStreamResponse({ stream: resumableStream })
          } catch (error) {
            console.error('Agent error:', error);
            return Response.json(
              { error: "Failed to process request" },
              { status: 500 }
            );
          }
        },
      },

      "/api/chat/:chatId/metadata": {
        async GET(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            if (!chatId) {
              return Response.json(
                { error: "Chat ID is required" },
                { status: 400 }
              );
            }

            // Get chat metadata
            const chatMeta = await redis.get(`chat:${chatId}:meta`);
            if (!chatMeta) {
              return Response.json(
                { error: "Chat not found" },
                { status: 404 }
              );
            }

            const meta = typeof chatMeta === 'string' ? JSON.parse(chatMeta) : chatMeta;
            return Response.json(meta);
          } catch (error) {
            console.error('Error retrieving chat metadata:', error);
            return Response.json(
              { error: "Failed to retrieve chat metadata" },
              { status: 500 }
            );
          }
        }
      },

      "/api/chat/:chatId/stream": {
        async GET(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            const streamId = await redis.get(`chat:${chatId}:latest_stream`) as string;

            if (!streamId) {
              return Response.json(
                { error: "Stream does not exist" },
                { status: 404 }
              )
            }

            console.log("streamId", streamId);

            const streamKey = `${streamId}`
            const groupName = `sse-group-${generateId()}`

            const keyExists = await redis.exists(streamKey)

            if (!keyExists) {
              return Response.json(
                { error: "Stream does not exist" },
                { status: 404 }
              )
            }

            try {
              await redis.xgroup(streamKey, {
                type: "CREATE",
                group: groupName,
                id: "0",
              })
            } catch (_err) { }

            const response = new Response(
              new ReadableStream({
                async start(controller) {
                  let isClosed = false;

                  const safeEnqueue = (data: any) => {
                    if (!isClosed) {
                      try {
                        controller.enqueue(data);
                      } catch (error) {
                        console.error("Error enqueuing data:", error);
                        isClosed = true;
                      }
                    }
                  };

                  const safeClose = () => {
                    if (!isClosed) {
                      try {
                        controller.close();
                        isClosed = true;
                      } catch (error) {
                        console.error("Error closing controller:", error);
                      }
                    }
                  };

                  const readStreamMessages = async () => {
                    try {
                      const chunks = (await redis.xreadgroup(
                        groupName,
                        `consumer-1`,
                        streamKey,
                        ">"
                      )) as StreamData[]

                      // console.log("chunks", chunks);

                      if (chunks?.length > 0) {
                        const [_streamKey, messages] = chunks[0]
                        for (const [_messageId, fields] of messages) {
                          const rawObj = arrToObj(fields)
                          const validatedMessage = validateMessage(rawObj)

                          // console.log("validatedMessage", validatedMessage);

                          if (validatedMessage?.type === MessageType.CHUNK) {
                            safeEnqueue(json(validatedMessage.content))
                          } else if (validatedMessage?.type === MessageType.METADATA) {
                            if (validatedMessage.status === StreamStatus.COMPLETED || validatedMessage.status === StreamStatus.ERROR) {
                              safeClose()
                            }
                          } else {
                            console.log("not a chunk", validatedMessage);
                          }
                        }
                      }
                    } catch (error) {
                      console.error("Error reading stream messages:", error);
                    }
                  }

                  await readStreamMessages()

                  const subscription = redis.subscribe(streamKey)

                  subscription.on("message", async () => {
                    try {
                      await readStreamMessages()
                    } catch (error) {
                      console.error("Error in message handler:", error);
                    }
                  })

                  subscription.on("error", (error) => {
                    console.error(`SSE subscription error on ${streamKey}:`, error)

                    const errorMessage: ErrorMessage = {
                      type: MessageType.ERROR,
                      error: error.message,
                    }

                    safeEnqueue(json(errorMessage))
                    safeClose()
                  })

                  req.signal.addEventListener("abort", () => {
                    console.log("Client disconnected, cleaning up subscription")
                    subscription.unsubscribe()
                    safeClose()
                  })
                },
              }),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache, no-transform",
                  Connection: "keep-alive",
                },
              }
            )

            return response
          } catch (error) {
            console.error('Error in stream route:', error);
            return Response.json(
              { error: "Failed to process request" },
              { status: 500 }
            );
          }
        }
      },

      "/api/chat/:chatId/publish": {
        async POST(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            if (!chatId) {
              return Response.json(
                { error: "Chat ID is required" },
                { status: 400 }
              );
            }

            // Check if chat exists
            const chatExists = await redis.exists(`chat:${chatId}:meta`);
            if (!chatExists) {
              return Response.json(
                { error: "Chat not found" },
                { status: 404 }
              );
            }

            // Load chat messages for AI metadata generation
            const messages = await loadChat(chatId);

            // Generate AI-optimized metadata using Vercel AI SDK
            let aiGeneratedMetadata;
            try {
              aiGeneratedMetadata = await generateAIMetadata(messages, chatId);
            } catch (error) {
              console.warn('Failed to generate AI metadata, using fallback:', error);
              // Fallback to regular metadata if AI generation fails
              aiGeneratedMetadata = generateChatMetadata(messages);
            }

            // Cache the AI-generated metadata
            await redis.set(`chat:${chatId}:metadata`, JSON.stringify({
              title: aiGeneratedMetadata.title,
              description: aiGeneratedMetadata.description,
              generatedAt: new Date().toISOString(),
              model: 'ai-generated'
            }));

            // Add to published chats set
            await redis.sadd("published_chats", chatId);

            // Set publish metadata
            await redis.set(`chat:${chatId}:published`, JSON.stringify({
              publishedAt: new Date().toISOString(),
              isPublished: true
            }));

            return Response.json({
              success: true,
              chatId,
              published: true,
              metadata: aiGeneratedMetadata
            });
          } catch (error) {
            console.error('Error publishing chat:', error);
            return Response.json(
              { error: "Failed to publish chat" },
              { status: 500 }
            );
          }
        }
      },

      "/api/chat/:chatId/unpublish": {
        async POST(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            if (!chatId) {
              return Response.json(
                { error: "Chat ID is required" },
                { status: 400 }
              );
            }

            // Remove from published chats set
            await redis.srem("published_chats", chatId);

            // Remove publish metadata
            await redis.del(`chat:${chatId}:published`);

            // Remove cached AI-generated metadata
            await redis.del(`chat:${chatId}:metadata`);

            return Response.json({
              success: true,
              chatId,
              published: false
            });
          } catch (error) {
            console.error('Error unpublishing chat:', error);
            return Response.json(
              { error: "Failed to unpublish chat" },
              { status: 500 }
            );
          }
        }
      },

      "/api/chat/:chatId/regenerate-metadata": {
        async POST(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            if (!chatId) {
              return Response.json(
                { error: "Chat ID is required" },
                { status: 400 }
              );
            }

            // Check if chat exists and is published
            const chatExists = await redis.exists(`chat:${chatId}:meta`);
            const isPublished = await redis.sismember("published_chats", chatId);

            if (!chatExists) {
              return Response.json(
                { error: "Chat not found" },
                { status: 404 }
              );
            }

            if (!isPublished) {
              return Response.json(
                { error: "Chat is not published" },
                { status: 400 }
              );
            }

            // Load chat messages
            const messages = await loadChat(chatId);

            // Generate new AI-optimized metadata
            let aiGeneratedMetadata;
            try {
              aiGeneratedMetadata = await generateAIMetadata(messages, chatId);
            } catch (error) {
              console.warn('Failed to generate AI metadata, using fallback:', error);
              aiGeneratedMetadata = generateChatMetadata(messages);
            }

            // Update cached metadata
            await redis.set(`chat:${chatId}:metadata`, JSON.stringify({
              title: aiGeneratedMetadata.title,
              description: aiGeneratedMetadata.description,
              generatedAt: new Date().toISOString(),
              model: 'ai-generated',
              regenerated: true
            }));

            return Response.json({
              success: true,
              chatId,
              metadata: aiGeneratedMetadata,
              regenerated: true
            });
          } catch (error) {
            console.error('Error regenerating metadata:', error);
            return Response.json(
              { error: "Failed to regenerate metadata" },
              { status: 500 }
            );
          }
        }
      },

      "/api/chat/:chatId/published": {
        async GET(req) {
          try {
            const url = new URL(req.url);
            const chatId = url.pathname.split('/')[3]; // Extract chatId from path

            if (!chatId) {
              return Response.json(
                { error: "Chat ID is required" },
                { status: 400 }
              );
            }

            // Check if chat is in published set
            const isPublished = await redis.sismember("published_chats", chatId);

            let publishedAt = null;
            if (isPublished) {
              const publishMeta = await redis.get(`chat:${chatId}:published`);
              if (publishMeta) {
                try {
                  // Handle both string and object responses from Redis
                  const meta = typeof publishMeta === 'string' ? JSON.parse(publishMeta) : publishMeta;
                  publishedAt = meta.publishedAt;
                } catch (error) {
                  console.error('Error parsing publish metadata:', error);
                  publishedAt = new Date().toISOString(); // Fallback
                }
              }
            }

            return Response.json({
              chatId,
              published: isPublished,
              publishedAt
            });
          } catch (error) {
            console.error('Error checking publish status:', error);
            return Response.json(
              { error: "Failed to check publish status" },
              { status: 500 }
            );
          }
        }
      },

      "/sitemap.xml": {
        async GET() {
          try {
            // Get all published chat IDs
            const publishedChatIds = await redis.smembers("published_chats");

            if (!publishedChatIds || publishedChatIds.length === 0) {
              // Create empty sitemap using the sitemap library
              const { SitemapStream, streamToPromise } = await import('sitemap');
              const { Readable } = await import('stream');

              const smStream = new SitemapStream({
                hostname: process.env.BASE_URL || 'https://www.autocontent.run'
              });

              const emptyStream = Readable.from([]);
              const sitemap = await streamToPromise(emptyStream.pipe(smStream));

              return new Response(sitemap.toString(), {
                headers: {
                  "Content-Type": "application/xml",
                  "Cache-Control": "public, max-age=3600"
                }
              });
            }

            // Get publish metadata for each chat to include lastmod
            const chatMetadata = await Promise.all(
              publishedChatIds.map(async (chatId) => {
                const publishMeta = await redis.get(`chat:${chatId}:published`);
                let publishedAt = new Date().toISOString(); // Default fallback

                if (publishMeta) {
                  try {
                    // Handle both string and object responses from Redis
                    const meta = typeof publishMeta === 'string' ? JSON.parse(publishMeta) : publishMeta;
                    publishedAt = meta.publishedAt || publishedAt;
                  } catch (error) {
                    console.error(`Error parsing publish metadata for chat ${chatId}:`, error);
                  }
                }

                return { chatId, publishedAt };
              })
            );

            // Generate sitemap using the sitemap library
            const { SitemapStream, streamToPromise } = await import('sitemap');
            const { Readable } = await import('stream');

            const baseUrl = process.env.BASE_URL || 'https://www.autocontent.run';

            // Create sitemap entries
            const links = chatMetadata.map(({ chatId, publishedAt }) => ({
              url: `/chat/${chatId}`,
              lastmod: new Date(publishedAt).toISOString().split('T')[0], // YYYY-MM-DD format
              changefreq: 'weekly' as const,
              priority: 0.8
            }));

            // Create sitemap stream
            const smStream = new SitemapStream({ hostname: baseUrl });

            // Generate sitemap
            const sitemap = await streamToPromise(Readable.from(links).pipe(smStream));

            return new Response(sitemap.toString(), {
              headers: {
                "Content-Type": "application/xml",
                "Cache-Control": "public, max-age=3600"
              }
            });
          } catch (error) {
            console.error('Error generating sitemap:', error);
            return Response.json(
              { error: "Failed to generate sitemap" },
              { status: 500 }
            );
          }
        }
      },

      // Serve index.html for all unmatched routes.
      "/*": index,
    },

    development: process.env.NODE_ENV !== "production",
  });

  // Set up graceful shutdown handlers only once
  if (!globalThis.appState.gracefulShutdownSetup) {
    setupGracefulShutdown();
    globalThis.appState.gracefulShutdownSetup = true;
  } else {
    console.log('🛡️  Graceful shutdown handlers already set up (hot reload)');
  }

  console.log(`🚀 Server running at ${server.url}`);
}

// Graceful shutdown setup
function setupGracefulShutdown() {
  console.log('🛡️  Setting up graceful shutdown handlers...');

  const shutdown = async (signal: string) => {
    // Prevent multiple shutdown attempts
    if (globalThis.appState.shutdownInProgress) {
      console.log(`⚠️  Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    globalThis.appState.shutdownInProgress = true;
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    globalThis.appState.isShuttingDown = true;

    console.log(`📊 Currently ${globalThis.appState.activeStreams.size} active streams`);
    if (globalThis.appState.activeStreams.size > 0) {
      console.log('⏳ Waiting for active streams to complete...');
      logActiveStreams(); // Log which specific streams are active

      // Set a maximum wait time (e.g., 30 seconds)
      const maxWaitTime = 30000;
      const startTime = Date.now();

      while (globalThis.appState.activeStreams.size > 0 && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`⏱️  Still waiting... ${globalThis.appState.activeStreams.size} streams active: ${getActiveStreamIds().join(', ')}`);
      }

      if (globalThis.appState.activeStreams.size > 0) {
        console.log(`⚠️  Force shutdown after ${maxWaitTime}ms, ${globalThis.appState.activeStreams.size} streams still active: ${getActiveStreamIds().join(', ')}`);
      }
    }

    console.log('🔌 Closing server...');
    if (server && server.stop) {
      await server.stop();
    }

    await closeMCPClient();

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  };

  // Handle different shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
}

// Start the server
startServer().catch(console.error);
