import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { falSearchTool } from './tools/fal-search-tool';
import { falGenerateToolTool } from './tools/fal-generate-tool';

// Create gateway provider
const gateway = createOpenAI({
  baseURL: 'https://gateway.ai.cloudflare.com/v1',
  apiKey: process.env.VERCEL_API_KEY || process.env.OPENAI_API_KEY, // Fallback for testing
});

// Or use Vercel's gateway if you have the API key
const vercelGateway = createOpenAI({
  baseURL: 'https://api.vercel.com/v1/ai/gateway',
  apiKey: process.env.VERCEL_API_KEY,
});

// Use the appropriate gateway
const provider = process.env.VERCEL_API_KEY ? vercelGateway : gateway;

// Default models through gateway
const defaultModel = provider('gpt-4-turbo-preview');

export interface GatewayAgentOptions {
  model?: string; // Model name instead of model object
  maxSteps?: number;
  temperature?: number;
}

export class GatewayAgent {
  private modelName: string;
  private maxSteps: number;
  private temperature: number;

  constructor(options: GatewayAgentOptions = {}) {
    this.modelName = options.model || 'gpt-4-turbo-preview';
    this.maxSteps = options.maxSteps || 5;
    this.temperature = options.temperature || 0.7;
  }

  async processMessage(prompt: string, options: GatewayAgentOptions = {}) {
    const modelName = options.model || this.modelName;
    const model = provider(modelName);
    
    console.log(`🧠 [GATEWAY-AGENT] Using model: ${modelName}`);
    
    try {
      const result = await generateText({
        model: "xai/grok-4",
        temperature: options.temperature || this.temperature,
        // maxSteps: options.maxSteps || this.maxSteps,
        system: `You are a helpful AI assistant specializing in AI models and tools. You have access to FAL AI's model catalog and can help users:

1. Search for AI models using the falSearch tool
2. Generate dynamic tools for specific models using falGenerateTool  
3. Provide guidance on using different AI models

When users ask about AI models:
- Use falSearch to find relevant models
- Suggest generating tools for specific models they're interested in
- Provide clear, helpful responses about model capabilities

Be concise but informative. When showing model results, highlight key information like the model name, category, and what it does.`,
        prompt,
        tools: {
          falSearch: falSearchTool,
          falGenerateTool: falGenerateToolTool,
        },
      });

      return {
        success: true,
        text: result.text,
        steps: result.steps,
        usage: result.usage,
        finishReason: result.finishReason,
        messages: result.content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async *processMessageStream(prompt: string, options: GatewayAgentOptions = {}) {
    const modelName = options.model || this.modelName;
    const model = provider(modelName);
    
    console.log(`🎬 [GATEWAY-AGENT] Streaming with model: ${modelName}`);
    
    try {
      const result = streamText({
        model: "xai/grok-4",
        temperature: options.temperature || this.temperature,
        // maxSteps: options.maxSteps || this.maxSteps,
        system: `You are a helpful AI assistant specializing in AI models and tools. You have access to FAL AI's model catalog and can help users:

1. Search for AI models using the falSearch tool
2. Generate dynamic tools for specific models using falGenerateTool  
3. Provide guidance on using different AI models

When users ask about AI models:
- Use falSearch to find relevant models
- Suggest generating tools for specific models they're interested in
- Provide clear, helpful responses about model capabilities

Be concise but informative. When showing model results, highlight key information like the model name, category, and what it does.`,
        prompt,
        tools: {
          falSearch: falSearchTool,
          falGenerateTool: falGenerateToolTool,
        },
      });

      for await (const delta of result.textStream) {
        yield {
          type: 'text-delta' as const,
          textDelta: delta,
        };
      }

      // Final result
      const finalResult = await result.text;
      yield {
        type: 'finish' as const,
        text: finalResult,
        usage: await result.usage,
        finishReason: await result.finishReason,
        steps: await result.steps,
      };

    } catch (error) {
      yield {
        type: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // Switch model dynamically
  switchModel(modelName: string) {
    this.modelName = modelName;
  }

  // Available models through gateway
  static getAvailableModels() {
    return [
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  // Get current configuration
  getConfig() {
    return {
      modelName: this.modelName,
      maxSteps: this.maxSteps,
      temperature: this.temperature,
      gatewayEnabled: !!process.env.VERCEL_API_KEY,
    };
  }
}

// Export singleton instance
export const gatewayAgent = new GatewayAgent();