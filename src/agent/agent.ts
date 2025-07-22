import { Tool, ToolResult } from './tools/base';
import { findFalApiTool } from './tools/find-fal-api';
import { generateFalToolTool } from './tools/generate-fal-tool';
import { executeFalToolTool } from './tools/execute-fal-tool';
import { toolRegistry } from './tools/tool-registry';

interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: {
    name: string;
    parameters: any;
    result?: ToolResult;
  };
}

export class Agent {
  private tools: Map<string, Tool> = new Map();
  private messages: AgentMessage[] = [];

  constructor() {
    this.registerTool(findFalApiTool);
    this.registerTool(generateFalToolTool);
    this.registerTool(executeFalToolTool);
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  async processPrompt(prompt: string): Promise<AgentMessage[]> {
    this.messages = [];
    this.messages.push({ role: 'user', content: prompt });

    const toolCall = this.determineToolCall(prompt);
    
    if (toolCall) {
      const tool = this.tools.get(toolCall.name);
      if (tool) {
        const result = await tool.execute(toolCall.parameters);
        
        const toolMessage: AgentMessage = {
          role: 'tool',
          content: `Tool ${toolCall.name} executed`,
          toolCall: {
            name: toolCall.name,
            parameters: toolCall.parameters,
            result
          }
        };
        this.messages.push(toolMessage);

        const assistantResponse = this.formatToolResponse(toolCall.name, result);
        this.messages.push({ role: 'assistant', content: assistantResponse });
      } else {
        this.messages.push({ 
          role: 'assistant', 
          content: `Tool ${toolCall.name} not found` 
        });
      }
    } else {
      this.messages.push({ 
        role: 'assistant', 
        content: `I can help you with FAL AI models in several ways:

🔍 **Search for models:**
- "find image generation models"
- "search for video models" 
- "show text-to-image models"

🔧 **Generate dynamic tools:**
- "generate tool for fal-ai/flux/schnell"
- "create endpoint for [model-id]"

⚡ **Execute model tools:**
- "execute fal-ai/flux/schnell with parameters"
- "run [endpoint-id] with input"

What would you like to do?` 
      });
    }

    return this.messages;
  }

  private determineToolCall(prompt: string): { name: string; parameters: any } | null {
    const lowerPrompt = prompt.toLowerCase();
    
    // Check for generate tool requests
    if (lowerPrompt.includes('generate') && (lowerPrompt.includes('tool') || lowerPrompt.includes('endpoint'))) {
      // Extract endpoint ID from prompt
      const words = prompt.split(/\s+/);
      let endpointId = null;
      
      // Look for patterns like fal-ai/flux/schnell or fal-ai%2Fflux%2Fschnell
      for (const word of words) {
        if (word.includes('fal-ai') && (word.includes('/') || word.includes('%2F'))) {
          endpointId = word.replace(/%2F/g, '/');
          break;
        }
      }
      
      if (endpointId) {
        return {
          name: 'generateFalTool',
          parameters: { endpointId }
        };
      }
    }
    
    // Check for execute tool requests
    if (lowerPrompt.includes('execute') || lowerPrompt.includes('run') || lowerPrompt.includes('use')) {
      // Try to extract endpoint ID and input parameters
      const words = prompt.split(/\s+/);
      let endpointId = null;
      
      for (const word of words) {
        if (word.includes('fal-ai') && (word.includes('/') || word.includes('%2F'))) {
          endpointId = word.replace(/%2F/g, '/');
          break;
        }
      }
      
      if (endpointId) {
        // For now, return a basic structure - in a real implementation,
        // you'd parse the input parameters from the prompt
        return {
          name: 'executeFalTool',
          parameters: { 
            endpointId,
            input: { prompt: "A simple test prompt" } // This should be extracted from user prompt
          }
        };
      }
    }
    
    // Default to search functionality
    if (lowerPrompt.includes('find') || lowerPrompt.includes('search') || lowerPrompt.includes('show') || lowerPrompt.includes('list')) {
      const parameters: any = {};
      
      if (lowerPrompt.includes('image') && lowerPrompt.includes('video')) {
        parameters.category = 'image-to-video';
      } else if (lowerPrompt.includes('text') && lowerPrompt.includes('image')) {
        parameters.category = 'text-to-image';
      } else if (lowerPrompt.includes('video')) {
        parameters.query = 'video';
      } else if (lowerPrompt.includes('image')) {
        parameters.query = 'image';
      } else {
        const searchTerms = prompt.split(' ').filter(word => 
          !['find', 'search', 'show', 'list', 'me', 'the', 'for', 'models', 'model'].includes(word.toLowerCase())
        );
        if (searchTerms.length > 0) {
          parameters.query = searchTerms.join(' ');
        }
      }
      
      parameters.limit = 5;
      
      return {
        name: 'findFalAPI',
        parameters
      };
    }
    
    return null;
  }

  private formatToolResponse(toolName: string, result: ToolResult): string {
    if (!result.success) {
      return `Error: ${result.error || 'Unknown error'}`;
    }

    if (toolName === 'findFalAPI' && result.data) {
      const { count, totalAvailable, models } = result.data;
      
      if (count === 0) {
        return 'No models found matching your search criteria.';
      }

      let response = `Found ${count} models`;
      if (totalAvailable > count) {
        response += ` (showing first ${count} of ${totalAvailable})`;
      }
      response += ':\n\n';

      models.forEach((model: any, index: number) => {
        response += `${index + 1}. **${model.title}**\n`;
        response += `   - Category: ${model.category}\n`;
        response += `   - Description: ${model.description}\n`;
        response += `   - Endpoint ID: ${model.id}\n`;
        if (model.tags.length > 0) {
          response += `   - Tags: ${model.tags.join(', ')}\n`;
        }
        response += `   - URL: ${model.url}\n`;
        if (model.highlighted) {
          response += `   - ⭐ Highlighted model\n`;
        }
        response += '\n';
      });

      response += '💡 **Tip**: You can generate a tool for any model by saying "generate tool for [endpoint-id]"';
      
      return response;
    }

    if (toolName === 'generateFalTool' && result.data) {
      const { endpointId, status, message, toolDescription } = result.data;
      let response = `${message}\n\n`;
      
      if (status === 'created') {
        response += `🎉 New tool created for **${endpointId}**!\n\n`;
      } else {
        response += `ℹ️  Tool for **${endpointId}** already exists.\n\n`;
      }
      
      if (toolDescription) {
        response += `**Tool Description:**\n${toolDescription}\n`;
        response += `\n💡 **Tip**: You can now execute this tool by saying "execute ${endpointId} with [parameters]"`;
      }
      
      return response;
    }

    if (toolName === 'executeFalTool' && result.data) {
      const { tool, endpointId, status, queueStatus, message } = result.data;
      let response = `✅ ${message}\n\n`;
      response += `**Details:**\n`;
      response += `- Tool: ${tool}\n`;
      response += `- Endpoint: ${endpointId}\n`;
      response += `- Status: ${status}\n`;
      
      if (queueStatus) {
        response += `- Request ID: ${queueStatus.request_id}\n`;
        response += `- Queue Status: ${queueStatus.status}\n`;
        if (queueStatus.status_url) {
          response += `- Status URL: ${queueStatus.status_url}\n`;
        }
      }
      
      response += `\n💡 **Note**: This is a queued request. In a full implementation, you would poll the status URL to get the final results.`;
      
      return response;
    }

    return JSON.stringify(result.data, null, 2);
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const agent = new Agent();