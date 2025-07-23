import React, { useRef, useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Loader2, Search, Globe, Code, Wrench, ChevronDown, ChevronRight } from "lucide-react";

export function APITester() {
  const { messages, sendMessage, status } = useChat({});
  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set());
  const [autoCollapsedTools, setAutoCollapsedTools] = useState<Set<string>>(new Set());

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-collapse completed tools (only once when they first complete)
  useEffect(() => {
    const newCollapsedTools = new Set(collapsedTools);
    const newAutoCollapsedTools = new Set(autoCollapsedTools);
    let hasNewCollapsed = false;

    messages.forEach((message) => {
      message.parts.forEach((part, partIndex) => {
        if (part.type?.startsWith("tool-")) {
          const toolId = `${message.id}-${partIndex}`;
          const isCompleted = (part as any).state === "output-available";
          
          // Only auto-collapse if it's completed and we haven't auto-collapsed it before
          if (isCompleted && !autoCollapsedTools.has(toolId)) {
            newCollapsedTools.add(toolId);
            newAutoCollapsedTools.add(toolId);
            hasNewCollapsed = true;
          }
        }
      });
    });

    if (hasNewCollapsed) {
      setCollapsedTools(newCollapsedTools);
      setAutoCollapsedTools(newAutoCollapsedTools);
    }
  }, [messages]); // Remove collapsedTools from dependencies to prevent loop

  const toggleToolCollapse = (toolId: string) => {
    const newCollapsed = new Set(collapsedTools);
    if (newCollapsed.has(toolId)) {
      newCollapsed.delete(toolId);
    } else {
      newCollapsed.add(toolId);
    }
    setCollapsedTools(newCollapsed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (promptInputRef.current?.value.trim()) {
        sendMessage({
          role: "user",
          text: promptInputRef.current?.value,
        });
        promptInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (promptInputRef.current?.value.trim()) {
      sendMessage({
        role: "user",
        text: promptInputRef.current?.value,
      });
      promptInputRef.current.value = "";
    }
  };

  const isLoading = status !== "ready";

  console.log(messages);
  
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages Container */}
      <div className="flex-1 flex flex-col pb-16 pt-16">
        <div className="w-full max-w-4xl mx-auto px-6 pb-4">
          <div className="flex flex-col-reverse space-y-2 space-y-reverse">
            {isLoading && (
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {messages.slice().reverse().map((message, index) => (
              <div key={message.id} className="flex flex-col gap-2">
                {message.parts.map((part, partIndex) => {
                  // Handle different part types
                  if (part.type === "step-start") {
                    return (
                      <div key={partIndex} className="flex gap-2 justify-start">
                        <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <Wrench className="w-3 h-3 text-white" />
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <div className="text-sm text-blue-700 font-medium">
                            Starting analysis...
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (part.type?.startsWith("tool-")) {
                    const toolName = part.type.replace("tool-", "");
                    const isCompleted = (part as any).state === "output-available";
                    const toolId = `${message.id}-${partIndex}`;
                    const isCollapsed = collapsedTools.has(toolId);
                    
                    return (
                      <div key={partIndex} className="flex gap-2 justify-start">
                        <div className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                          isCompleted ? "bg-green-500" : "bg-orange-500"
                        )}>
                          {toolName === "webSearch" ? (
                            <Search className="w-3 h-3 text-white" />
                          ) : toolName === "codeSearch" ? (
                            <Code className="w-3 h-3 text-white" />
                          ) : (
                            <Globe className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <div className={cn(
                          "rounded-lg border cursor-pointer transition-all",
                          isCompleted 
                            ? "bg-green-50 border-green-200" 
                            : "bg-orange-50 border-orange-200",
                          isCollapsed ? "px-3 py-1" : "px-3 py-2"
                        )}
                        onClick={() => isCompleted && toggleToolCollapse(toolId)}
                        >
                          <div className="text-sm flex flex-col items-start">
                            <div className={cn(
                              "font-medium flex items-center gap-1",
                              isCompleted ? "text-green-700" : "text-orange-700",
                              isCollapsed ? "mb-0" : "mb-1"
                            )}>
                              {isCompleted && (
                                isCollapsed ? (
                                  <ChevronRight className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )
                              )}
                              {toolName === "webSearch" && "🔍 Web Search"}
                              {toolName === "codeSearch" && "💻 Code Search"} 
                              {!["webSearch", "codeSearch"].includes(toolName) && `🛠️ ${toolName}`}
                              {isCompleted && " ✓"}
                            </div>
                            
                            {!isCollapsed && (part as any).input && (
                              <div className="text-xs text-gray-600 mb-2 text-start">
                                <strong>Query:</strong> {(part as any).input.query || JSON.stringify((part as any).input)}
                              </div>
                            )}
                            
                            {!isCollapsed && (part as any).output && isCompleted && (
                              <div className="text-xs text-gray-600">
                                {Array.isArray((part as any).output) ? (
                                  // Check if this is an array of media items (images/videos)
                                  (part as any).output.length > 0 && ((part as any).output[0].type === "image" || (part as any).output[0].type === "video") ? (
                                    <div>
                                      <strong>Generated {(part as any).output.length} media item{(part as any).output.length > 1 ? 's' : ''}</strong>
                                      <div className="mt-2 grid grid-cols-1 gap-2">
                                        {(part as any).output.map((item: any, i: number) => (
                                          <div key={i} className="bg-white rounded border p-2">
                                            {item.type === "image" ? (
                                              <div>
                                                <div className="font-medium text-gray-800 mb-1">🖼️ Image {i + 1}</div>
                                                <img 
                                                  src={item.url} 
                                                  alt={`Generated image ${i + 1}`}
                                                  className="max-w-full h-auto rounded border max-h-48 object-contain"
                                                  style={{ maxWidth: '300px' }}
                                                />
                                                <div className="text-xs text-gray-500 mt-1">
                                                  {item.width} × {item.height}
                                                </div>
                                              </div>
                                            ) : item.type === "video" ? (
                                              <div>
                                                <div className="font-medium text-gray-800 mb-1">🎥 Video {i + 1}</div>
                                                <video 
                                                  src={item.url} 
                                                  controls
                                                  className="max-w-full h-auto rounded border max-h-48"
                                                  style={{ maxWidth: '300px' }}
                                                />
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    // Default handling for other arrays (like search results)
                                    <div>
                                      <strong>Found {(part as any).output.length} results</strong>
                                      {(part as any).output.slice(0, 2).map((result: any, i: number) => (
                                        <div key={i} className="mt-1 p-1 bg-white rounded border">
                                          <div className="font-medium text-gray-800">{result.title}</div>
                                          <div className="text-gray-500 truncate">{result.content?.substring(0, 100)}...</div>
                                        </div>
                                      ))}
                                      {(part as any).output.length > 2 && (
                                        <div className="text-center mt-1 text-gray-500">
                                          and {(part as any).output.length - 2} more results...
                                        </div>
                                      )}
                                    </div>
                                  )
                                ) : (
                                  <div><strong>Output:</strong> {JSON.stringify((part as any).output).substring(0, 200)}...</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (part.type === "text" && part.text.trim()) {
                    // Skip text parts that are just simple confirmations after tool use
                    if ((part as any).state === "done" && part.text.length < 50 && 
                        message.parts.some(p => p.type?.startsWith("tool-"))) {
                      return null;
                    }

                    return (
                      <div key={partIndex} className={cn(
                        "flex gap-2",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}>
                        {message.role === "assistant" && (
                          <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}

                        <div className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}>
                          <div className="text-sm whitespace-pre-wrap text-start">
                            {part.text}
                          </div>
                        </div>

                        {message.role === "user" && (
                          <div className="flex-shrink-0 w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 mx-auto max-w-4xl inset-x-0 fixed bottom-0 w-full">
        <div className="px-6 py-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <textarea
              ref={promptInputRef}
              name="prompt"
              placeholder="Type your message here... (Cmd+Enter to send)"
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              className={cn(
                "flex-1 min-h-[40px] max-h-[200px] bg-background",
                "border border-input rounded-md px-3 py-2",
                "text-sm placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "resize-none",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              style={{
                height: 'auto',
                minHeight: '40px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
              required
            />

            <Button
              type="submit"
              disabled={isLoading}
              size="sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </>
              ) : (
                <ArrowUp />
              )}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
