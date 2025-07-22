import { serve } from "bun";
import index from "./index.html";
import { falApiClient } from "./services/fal-api";
import { agent } from "./agent/agent";
import { executionAgent } from "./agent/execution-agent";
import { aiAgent } from "./ai/agent";
import { gatewayAgent } from "./ai/gateway-agent";

// Initialize FAL API client on startup
console.log("🚀 [STARTUP] Initializing FAL API client...");
await falApiClient.initialize();
console.log("✅ [STARTUP] FAL API client initialized");

console.log("🔑 [STARTUP] Checking environment variables...");
console.log("  - VERCEL_API_KEY:", process.env.VERCEL_API_KEY ? "SET" : "NOT SET");
console.log("  - OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "SET" : "NOT SET");
console.log("  - ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET");

console.log("🌐 [STARTUP] Gateway Agent Configuration:");
console.log("  -", JSON.stringify(gatewayAgent.getConfig(), null, 2));

console.log("🧠 [STARTUP] Testing Gateway Agent...");
try {
  // Simple test to make sure gateway agent is working
  const testResult = await gatewayAgent.processMessage("Hello");
  console.log("✅ [STARTUP] Gateway Agent test successful:", testResult.success);
  if (!testResult.success) {
    console.error("❌ [STARTUP] Gateway Agent test failed:", testResult.error);
  }
} catch (error) {
  console.error("💥 [STARTUP] Gateway Agent test crashed:", error);
  console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack');
}

console.log("🌐 [STARTUP] Starting server...");
const server = serve({
  fetch(req) {
    console.log(`📥 [REQUEST] ${req.method} ${req.url}`);
    return null; // Let routes handle it
  },
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    "/api/test": {
      async GET(req) {
        console.log("🧪 [TEST] Simple test endpoint called");
        return Response.json({ 
          message: "Test endpoint working", 
          timestamp: new Date().toISOString(),
          aiAgentAvailable: !!aiAgent
        });
      },
      async POST(req) {
        console.log("🧪 [TEST] POST test endpoint called");
        try {
          const body = await req.json();
          console.log("📝 [TEST] Body:", body);
          return Response.json({ 
            message: "POST test working", 
            receivedBody: body,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error("💥 [TEST] Error:", error);
          return Response.json({ error: String(error) }, { status: 500 });
        }
      }
    },

    "/api/agent": {
      async POST(req) {
        try {
          const body = await req.json();
          const { prompt } = body;
          
          if (!prompt) {
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }
          
          const messages = await agent.processPrompt(prompt);
          
          return Response.json({
            messages,
            tools: agent.getAvailableTools()
          });
        } catch (error) {
          console.error("Agent error:", error);
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },

    "/api/agent/execute": {
      async POST(req) {
        try {
          const body = await req.json();
          const { endpointId, prompt } = body;
          
          if (!endpointId || !prompt) {
            return Response.json({ 
              error: "Both endpointId and prompt are required" 
            }, { status: 400 });
          }
          
          const messages = await executionAgent.executeWithDynamicTool(endpointId, prompt);
          
          return Response.json({
            messages,
            endpointId
          });
        } catch (error) {
          console.error("Execution agent error:", error);
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },

    "/api/ai-agent": {
      async POST(req) {
        console.log("🌐 [GATEWAY-AGENT] Request received");
        
        try {
          const body = await req.json();
          console.log("📝 [GATEWAY-AGENT] Request body:", JSON.stringify(body, null, 2));
          
          const { prompt, model } = body;
          
          if (!prompt) {
            console.log("❌ [GATEWAY-AGENT] No prompt provided");
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }
          
          console.log("🔄 [GATEWAY-AGENT] Processing prompt:", prompt);
          const result = await gatewayAgent.processMessage(prompt, { model });
          console.log("✅ [GATEWAY-AGENT] Result:", JSON.stringify(result, null, 2));
          
          if (!result.success) {
            console.log("❌ [GATEWAY-AGENT] Processing failed:", result.error);
            return Response.json({ error: result.error }, { status: 500 });
          }
          
          const response = {
            text: result.text,
            steps: result.steps,
            usage: result.usage,
            finishReason: result.finishReason,
            messages: result.messages,
            config: gatewayAgent.getConfig(),
          };
          
          console.log("📤 [GATEWAY-AGENT] Sending response:", JSON.stringify(response, null, 2));
          return Response.json(response);
        } catch (error) {
          console.error("💥 [GATEWAY-AGENT] Fatal error:", error);
          console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },

    "/api/ai-agent-direct": {
      async POST(req) {
        console.log("🤖 [AI-AGENT-DIRECT] Request received (direct provider)");
        
        try {
          const body = await req.json();
          console.log("📝 [AI-AGENT-DIRECT] Request body:", JSON.stringify(body, null, 2));
          
          const { prompt } = body;
          
          if (!prompt) {
            console.log("❌ [AI-AGENT-DIRECT] No prompt provided");
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }
          
          console.log("🔄 [AI-AGENT-DIRECT] Processing prompt:", prompt);
          const result = await aiAgent.processMessage(prompt);
          console.log("✅ [AI-AGENT-DIRECT] Result:", JSON.stringify(result, null, 2));
          
          if (!result.success) {
            console.log("❌ [AI-AGENT-DIRECT] Processing failed:", result.error);
            return Response.json({ error: result.error }, { status: 500 });
          }
          
          const response = {
            text: result.text,
            steps: result.steps,
            usage: result.usage,
            finishReason: result.finishReason,
            messages: result.messages,
          };
          
          console.log("📤 [AI-AGENT-DIRECT] Sending response:", JSON.stringify(response, null, 2));
          return Response.json(response);
        } catch (error) {
          console.error("💥 [AI-AGENT-DIRECT] Fatal error:", error);
          console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },

    "/api/ai-agent/stream": {
      async POST(req) {
        console.log("🎬 [GATEWAY-STREAM] Request received");
        
        try {
          const body = await req.json();
          console.log("📝 [GATEWAY-STREAM] Request body:", JSON.stringify(body, null, 2));
          
          const { prompt, model } = body;
          
          if (!prompt) {
            console.log("❌ [GATEWAY-STREAM] No prompt provided");
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }

          console.log("🔄 [GATEWAY-STREAM] Starting stream for prompt:", prompt);

          // Create a readable stream using AI SDK's streaming
          const stream = new ReadableStream({
            async start(controller) {
              try {
                let fullText = '';
                let deltaCount = 0;
                
                console.log("🚀 [GATEWAY-STREAM] Processing message stream...");
                
                // Stream from Gateway agent
                for await (const delta of gatewayAgent.processMessageStream(prompt, { model })) {
                  deltaCount++;
                  console.log(`📡 [GATEWAY-STREAM] Delta ${deltaCount}:`, delta);
                  
                  if (delta.type === 'text-delta') {
                    fullText += delta.textDelta;
                    
                    // Send text delta
                    const data = { 
                      type: 'text-delta',
                      textDelta: delta.textDelta,
                      fullText: fullText
                    };
                    console.log(`📤 [GATEWAY-STREAM] Sending text delta:`, data);
                    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
                    
                  } else if (delta.type === 'finish') {
                    // Send final response
                    const data = { 
                      type: 'finish',
                      text: delta.text,
                      steps: delta.steps,
                      usage: delta.usage,
                      finishReason: delta.finishReason,
                      config: gatewayAgent.getConfig(),
                      done: true
                    };
                    console.log(`✅ [GATEWAY-STREAM] Sending finish:`, data);
                    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
                    break;
                    
                  } else if (delta.type === 'error') {
                    const data = { 
                      type: 'error',
                      error: delta.error 
                    };
                    console.log(`❌ [GATEWAY-STREAM] Sending error:`, data);
                    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
                    break;
                  }
                }
                
                console.log(`🏁 [GATEWAY-STREAM] Stream completed with ${deltaCount} deltas`);
                controller.close();
              } catch (error) {
                console.error("💥 [GATEWAY-STREAM] Stream processing error:", error);
                controller.enqueue(`data: ${JSON.stringify({ 
                  type: 'error',
                  error: error instanceof Error ? error.message : "Internal server error" 
                })}\n\n`);
                controller.close();
              }
            }
          });

          console.log("📡 [GATEWAY-STREAM] Returning stream response");
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        } catch (error) {
          console.error("💥 [GATEWAY-STREAM] Fatal error:", error);
          console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },

    "/api/agent/stream": {
      async POST(req) {
        try {
          const body = await req.json();
          const { prompt } = body;
          
          if (!prompt) {
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }

          // Create a readable stream
          const stream = new ReadableStream({
            async start(controller) {
              try {
                // Send initial user message
                const userMessage = { role: 'user', content: prompt };
                controller.enqueue(`data: ${JSON.stringify({ messages: [userMessage] })}\n\n`);

                // Simulate delay for streaming effect
                await new Promise(resolve => setTimeout(resolve, 100));

                // Process with agent
                const messages = await agent.processPrompt(prompt);
                
                // Stream each message individually
                for (const message of messages.slice(1)) { // Skip user message since we already sent it
                  if (message.role === 'tool') {
                    controller.enqueue(`data: ${JSON.stringify({ messages: [message] })}\n\n`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                  } else if (message.role === 'assistant') {
                    // Simulate typing effect for assistant messages
                    const words = message.content.split(' ');
                    let currentContent = '';
                    
                    for (let i = 0; i < words.length; i++) {
                      currentContent += (i > 0 ? ' ' : '') + words[i];
                      const streamMessage = { ...message, content: currentContent };
                      controller.enqueue(`data: ${JSON.stringify({ messages: [streamMessage], streaming: true })}\n\n`);
                      await new Promise(resolve => setTimeout(resolve, 50));
                    }
                  }
                }

                // Send final complete response
                controller.enqueue(`data: ${JSON.stringify({ 
                  messages, 
                  tools: agent.getAvailableTools(),
                  done: true
                })}\n\n`);
                
                controller.close();
              } catch (error) {
                controller.enqueue(`data: ${JSON.stringify({ 
                  error: error instanceof Error ? error.message : "Internal server error" 
                })}\n\n`);
                controller.close();
              }
            }
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        } catch (error) {
          console.error("Streaming agent error:", error);
          return Response.json({ 
            error: error instanceof Error ? error.message : "Internal server error" 
          }, { status: 500 });
        }
      }
    },
  },

  development: process.env.NODE_ENV !== "production",
});

console.log(`✅ [STARTUP] Server running at ${server.url}`);
console.log("🔍 [DEBUG] Available endpoints:");
console.log("  - /api/test (GET/POST) - Basic connectivity test");
console.log("  - /api/ai-agent (POST) - Gateway Agent (Recommended)");
console.log("  - /api/ai-agent/stream (POST) - Gateway Agent Streaming");
console.log("  - /api/ai-agent-direct (POST) - Direct Provider (needs API keys)");
console.log("  - /api/agent (POST) - Legacy Agent");
console.log("  - /api/agent/stream (POST) - Legacy Agent Streaming");
