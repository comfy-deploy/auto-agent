import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { falSearchTool } from './tools/fal-search-tool';
import { falGenerateToolTool } from './tools/fal-generate-tool';

// Default to OpenAI GPT-4 (you can switch providers easily)
const defaultModel = openai('gpt-4-turbo-preview');

// Alternative models you can use:
// const defaultModel = anthropic('claude-3-haiku-20240307');
// const defaultModel = anthropic('claude-3-sonnet-20240229');

export interface AIAgentOptions {
  model?: any; // Allow different models
  maxSteps?: number;
  temperature?: number;
}

export class AIAgent {
  private model: any;
  private maxSteps: number;
  private temperature: number;

  constructor(options: AIAgentOptions = {}) {
    this.model = options.model || defaultModel;
    this.maxSteps = options.maxSteps || 5;
    this.temperature = options.temperature || 0.7;
  }

  async processMessage(prompt: string, options: AIAgentOptions = {}) {
    const model = options.model || this.model;
    
    try {
      const result = await generateText({
        model,
        temperature: options.temperature || this.temperature,
        maxSteps: options.maxSteps || this.maxSteps,
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
        messages: result.responseMessages,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async *processMessageStream(prompt: string, options: AIAgentOptions = {}) {
    const model = options.model || this.model;
    
    try {
      const result = streamText({
        model,
        temperature: options.temperature || this.temperature,
        maxSteps: options.maxSteps || this.maxSteps,
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
  switchModel(model: any) {
    this.model = model;
  }

  // Available models for easy switching
  static getAvailableModels() {
    return {
      'gpt-4-turbo': openai('gpt-4-turbo-preview'),
      'gpt-4': openai('gpt-4'),
      'gpt-3.5-turbo': openai('gpt-3.5-turbo'),
      'claude-3-opus': anthropic('claude-3-opus-20240229'),
      'claude-3-sonnet': anthropic('claude-3-sonnet-20240229'),
      'claude-3-haiku': anthropic('claude-3-haiku-20240307'),
    };
  }
}

// Export singleton instance
export const aiAgent = new AIAgent();