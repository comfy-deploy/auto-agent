import React, { useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageDisplay } from "@/components/MessageDisplay";
import { cn } from "@/lib/utils";

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: {
    name: string;
    parameters: any;
    result?: any;
  };
}

export function APITester() {
  const responseRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [method, setMethod] = React.useState<string>("POST");
  const [endpoint, setEndpoint] = React.useState("/api/ai-agent");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [rawResponse, setRawResponse] = React.useState("");
  const [streamingMode, setStreamingMode] = React.useState(false);
  const [useAISDK, setUseAISDK] = React.useState(true);

  const testAISDKStreaming = async (prompt: string) => {
    setIsLoading(true);
    setMessages([]);
    setRawResponse("");

    try {
      const response = await fetch('/api/ai-agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      // Add user message immediately
      const userMessage: Message = { role: 'user', content: prompt };
      setMessages([userMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              setRawResponse(prev => prev + JSON.stringify(data, null, 2) + '\n\n');

              if (data.type === 'text-delta') {
                fullText += data.textDelta;
                
                // Update assistant message with streaming text
                setMessages(prev => {
                  const newMessages = [...prev];
                  const assistantIndex = newMessages.findIndex(m => m.role === 'assistant');
                  
                  const assistantMessage: Message = {
                    role: 'assistant',
                    content: fullText
                  };
                  
                  if (assistantIndex >= 0) {
                    newMessages[assistantIndex] = assistantMessage;
                  } else {
                    newMessages.push(assistantMessage);
                  }
                  
                  return newMessages;
                });

              } else if (data.type === 'finish') {
                // Final update with complete text
                setMessages(prev => {
                  const newMessages = [...prev];
                  const assistantIndex = newMessages.findIndex(m => m.role === 'assistant');
                  
                  const finalMessage: Message = {
                    role: 'assistant',
                    content: data.text
                  };
                  
                  if (assistantIndex >= 0) {
                    newMessages[assistantIndex] = finalMessage;
                  } else {
                    newMessages.push(finalMessage);
                  }
                  
                  return newMessages;
                });
                break;

              } else if (data.type === 'error') {
                setRawResponse(prev => prev + `Error: ${data.error}\n`);
                break;
              }
            } catch (e) {
              console.error('Failed to parse AI SDK SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = String(error);
      setRawResponse(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const testEndpointStreaming = async (prompt: string) => {
    if (useAISDK) {
      await testAISDKStreaming(prompt);
      return;
    }

    setIsLoading(true);
    setMessages([]);
    setRawResponse("");

    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let allMessages: Message[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              setRawResponse(prev => prev + JSON.stringify(data, null, 2) + '\n\n');

              if (data.messages) {
                if (data.streaming) {
                  // Update the last assistant message with streaming content
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessageIndex = newMessages.findLastIndex(m => m.role === 'assistant');
                    if (lastMessageIndex >= 0) {
                      newMessages[lastMessageIndex] = data.messages[0];
                    } else {
                      newMessages.push(...data.messages);
                    }
                    return newMessages;
                  });
                } else {
                  // Add new messages normally
                  allMessages.push(...data.messages);
                  setMessages(allMessages);
                }
              }

              if (data.done) {
                // Final update with complete messages
                if (data.messages) {
                  setMessages(data.messages);
                }
                break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = String(error);
      setRawResponse(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle switching between AI SDK and legacy agent
  const handleAISDKToggle = (checked: boolean) => {
    setUseAISDK(checked);
    if (checked) {
      setEndpoint("/api/ai-agent");
      setMethod("POST");
    } else {
      setEndpoint("/api/agent");
      setMethod("POST");
    }
  };

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Get prompt from body for streaming
    if (streamingMode && method === "POST" && bodyRef.current?.value) {
      try {
        const body = JSON.parse(bodyRef.current.value);
        if (body.prompt) {
          await testEndpointStreaming(body.prompt);
          return;
        }
      } catch (e) {
        // Fall back to regular mode if can't parse
      }
    }

    setIsLoading(true);
    setMessages([]);
    setRawResponse("");

    try {
      const url = new URL(endpoint, location.href);
      const options: RequestInit = { method };
      
      if (method === "POST" && bodyRef.current?.value) {
        options.headers = { "Content-Type": "application/json" };
        options.body = bodyRef.current.value;
      }
      
      const res = await fetch(url, options);
      const text = await res.text();
      
      try {
        const data = JSON.parse(text);
        
        // Update raw response
        setRawResponse(JSON.stringify(data, null, 2));
        
        // Handle AI SDK response format
        if (useAISDK && data.text) {
          const userMessage: Message = { 
            role: 'user', 
            content: JSON.parse(bodyRef.current?.value || '{}').prompt || 'Unknown prompt'
          };
          const assistantMessage: Message = {
            role: 'assistant',
            content: data.text
          };
          setMessages([userMessage, assistantMessage]);
        }
        // Handle legacy agent response format
        else if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        
        if (responseRef.current) {
          responseRef.current.value = JSON.stringify(data, null, 2);
        }
      } catch {
        const errorText = text || `${res.status} ${res.statusText}`;
        setRawResponse(errorText);
        if (responseRef.current) {
          responseRef.current.value = errorText;
        }
      }
    } catch (error) {
      const errorMsg = String(error);
      setRawResponse(errorMsg);
      if (responseRef.current) {
        responseRef.current.value = errorMsg;
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl flex flex-col gap-2">
      <form onSubmit={testEndpoint} className="flex flex-col gap-2">
        <div className="flex gap-1">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-20 h-8 text-xs font-mono">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
            </SelectContent>
          </Select>
          
          <Input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="flex-1 h-8 text-xs font-mono"
            placeholder="/api/endpoint"
          />
          
          <Button 
            type="submit" 
            variant="default" 
            size="sm" 
            className="h-8 px-3 text-xs"
            disabled={isLoading}
          >
            {isLoading ? "..." : "Send"}
          </Button>
        </div>

        {method === "POST" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="ai-sdk"
                  checked={useAISDK}
                  onCheckedChange={handleAISDKToggle}
                />
                <label htmlFor="ai-sdk" className="text-sm">
                  🤖 Use Vercel AI SDK (with tool calling)
                </label>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="streaming"
                  checked={streamingMode}
                  onCheckedChange={setStreamingMode}
                />
                <label htmlFor="streaming" className="text-sm">
                  🚀 Enable streaming
                </label>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                {useAISDK 
                  ? "🌐 Using Vercel AI Gateway (no API keys needed)" 
                  : "🔧 Using legacy agent system"
                }
              </div>
              <div className="text-xs">
                <strong>Available endpoints:</strong> /api/test, /api/ai-agent, /api/ai-agent-direct
              </div>
            </div>
          </div>
        )}
      </form>

      {method === "POST" && (
        <Textarea
          ref={bodyRef}
          placeholder='{"prompt": "find image models"}'
          defaultValue='{"prompt": "find image generation models"}'
          className="h-16 text-xs font-mono resize-none"
        />
      )}

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">💬 Chat View</TabsTrigger>
          <TabsTrigger value="raw">🔧 Raw JSON</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="mt-2">
          <div className="border rounded-lg h-96">
            {messages.length > 0 ? (
              <MessageDisplay messages={messages} streaming={isLoading} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  <span>Send a request to see chat messages here</span>
                )}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="raw" className="mt-2">
          <Textarea
            ref={responseRef}
            readOnly
            placeholder="Response..."
            className="h-96 text-xs font-mono resize-none"
            value={rawResponse}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}