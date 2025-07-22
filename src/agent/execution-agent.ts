import { toolRegistry } from './tools/tool-registry';

interface ExecutionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  execution?: {
    endpointId: string;
    input: any;
    result?: any;
    error?: string;
  };
}

export class ExecutionAgent {
  private messages: ExecutionMessage[] = [];

  async executeWithDynamicTool(endpointId: string, userPrompt: string): Promise<ExecutionMessage[]> {
    this.messages = [];
    this.messages.push({ role: 'user', content: userPrompt });

    // Check if tool exists
    if (!toolRegistry.hasToolForEndpoint(endpointId)) {
      // Try to generate it first
      const generated = await toolRegistry.generateToolForEndpoint(endpointId);
      if (!generated) {
        this.messages.push({
          role: 'assistant',
          content: `❌ Unable to generate or find tool for ${endpointId}. The endpoint may not exist or may not have a valid OpenAPI specification.`
        });
        return this.messages;
      }
    }

    // Extract parameters from the user prompt
    const input = this.parseInputFromPrompt(userPrompt, endpointId);
    
    if (!input) {
      const toolDescription = toolRegistry.getToolDescription(endpointId);
      this.messages.push({
        role: 'assistant',
        content: `🤔 I need more information to execute ${endpointId}. Here's what this tool accepts:\n\n${toolDescription}\n\nPlease provide the required parameters.`
      });
      return this.messages;
    }

    try {
      // Execute the tool
      const result = await toolRegistry.executeTool(endpointId, input);
      
      this.messages.push({
        role: 'assistant',
        content: `✅ Successfully executed ${endpointId}`,
        execution: {
          endpointId,
          input,
          result
        }
      });

      // Format the result for the user
      const formattedResult = this.formatExecutionResult(endpointId, result);
      this.messages.push({
        role: 'assistant',
        content: formattedResult
      });

    } catch (error) {
      this.messages.push({
        role: 'assistant',
        content: `❌ Failed to execute ${endpointId}`,
        execution: {
          endpointId,
          input,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      this.messages.push({
        role: 'assistant',
        content: `Error executing ${endpointId}: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    return this.messages;
  }

  private parseInputFromPrompt(prompt: string, endpointId: string): any | null {
    const lowerPrompt = prompt.toLowerCase();
    
    // For text-to-image models, try to extract prompt
    if (endpointId.includes('flux') || endpointId.includes('image') || lowerPrompt.includes('generate image')) {
      // Extract text after common phrases
      let imagePrompt = prompt;
      const extractPatterns = [
        /generate (?:an? )?image (?:of |with )?(.+)/i,
        /create (?:an? )?image (?:of |with )?(.+)/i,
        /make (?:an? )?image (?:of |with )?(.+)/i,
        /(?:prompt|text):\s*["']?([^"']+)["']?/i,
        /"([^"]+)"/,
        /'([^']+)'/
      ];

      for (const pattern of extractPatterns) {
        const match = prompt.match(pattern);
        if (match && match[1]) {
          imagePrompt = match[1].trim();
          break;
        }
      }

      if (imagePrompt && imagePrompt !== prompt) {
        return {
          prompt: imagePrompt,
          num_images: 1,
          image_size: "landscape_4_3"
        };
      }
    }

    // Try to parse JSON-like structures from the prompt
    const jsonMatch = prompt.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Default fallback - use the entire prompt as a prompt parameter
    if (lowerPrompt.includes('prompt') || lowerPrompt.includes('generate') || lowerPrompt.includes('create')) {
      return {
        prompt: prompt
      };
    }

    return null;
  }

  private formatExecutionResult(endpointId: string, result: any): string {
    if (!result) {
      return 'No result returned from the execution.';
    }

    let response = `🎯 **Execution Result for ${endpointId}:**\n\n`;
    
    if (result.status === 'submitted' && result.queueStatus) {
      response += `📋 **Queue Information:**\n`;
      response += `- Request ID: ${result.queueStatus.request_id}\n`;
      response += `- Status: ${result.queueStatus.status}\n`;
      
      if (result.queueStatus.queue_position) {
        response += `- Queue Position: ${result.queueStatus.queue_position}\n`;
      }
      
      if (result.queueStatus.status_url) {
        response += `- Status URL: ${result.queueStatus.status_url}\n`;
      }
      
      response += `\n💡 **Next Steps:**\n`;
      response += `Your request has been submitted to the FAL queue. In a production system, you would:\n`;
      response += `1. Poll the status URL to check progress\n`;
      response += `2. Retrieve the final result once processing is complete\n`;
      response += `3. Download any generated files (images, videos, etc.)\n`;
    } else {
      response += `Raw result:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    }

    return response;
  }

  getMessages(): ExecutionMessage[] {
    return this.messages;
  }

  clearMessages() {
    this.messages = [];
  }
}

export const executionAgent = new ExecutionAgent();