import React, { useRef, useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { ArrowUp, Loader2, Search, Globe, Code, Wrench, ChevronDown, ChevronRight, X, Download } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMutation } from "@tanstack/react-query";
import { MediaItem } from "@/components/MediaItem";
import { Logo } from "./components/ui/logo";

export function Chat(props: {
  initialMessages: UIMessage[];
  chatId: string;
  onMessagesChange?: (hasMessages: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}) {
  const [_, setChatId] = useQueryState('chatId')
  const [prompt, setPrompt] = useQueryState("prompt");
  const lastSentPrompt = useRef("");
  const [promptInputValue, setPromptInputValue] = useState("");

  console.log("props.chatId", props.chatId);

  const { messages, sendMessage, status, resumeStream } = useChat({
    messages: props.initialMessages,
    id: props.chatId,
    // resume: props.chatId ? true : false,
  });

  // Notify parent component about message state
  useEffect(() => {
    const hasMessages = messages.length > 0;
    props.onMessagesChange?.(hasMessages);
  }, [messages.length, props.onMessagesChange]);

  useEffect(() => {
    if (prompt && props.chatId && lastSentPrompt.current !== prompt) {
      lastSentPrompt.current = prompt;
      sendMessage({
        role: "user",
        text: prompt,
      });
      setPrompt(null);
    }
  }, [prompt, props.chatId]);

  const { mutateAsync: createChat, isPending: isCreatingChat } = useMutation<{ chatId: string }>({
    mutationFn: async () => {
      const response = await fetch('/api/chat/new', {
        method: 'POST',
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatId(data.chatId);
    }
  });

  const resumed = useRef(false);

  // Check if the last message is from the user
  const lastMessage = messages[messages.length - 1];
  const isLastMessageFromUser = lastMessage?.role === "user";

  console.log(messages);
  console.log("Last message is from user:", isLastMessageFromUser);

  useEffect(() => {
    if (!props.chatId) return;

    if (!isLastMessageFromUser) {
      return;
    }

    if (!resumed.current) {
      resumeStream();
      resumed.current = true;
    }
    // We want to disable the exhaustive deps rule here because we only want to run this effect once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastMessageFromUser]);

  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set());
  const [autoCollapsedTools, setAutoCollapsedTools] = useState<Set<string>>(new Set());
  const [selectedMediaItem, setSelectedMediaItem] = useState<{ id: string, type: 'image' | 'video', url: string, width?: number, height?: number } | null>(null);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Extract all media items from messages
  const getAllMediaItems = () => {
    const mediaItems: Array<{ id: string, type: 'image' | 'video', url: string, width?: number, height?: number, messageId: string, partIndex: number }> = [];

    messages.forEach((message) => {
      message.parts.forEach((part, partIndex) => {
        if (part.type?.startsWith("tool-") && (part as any).output && Array.isArray((part as any).output)) {
          (part as any).output.forEach((item: any, itemIndex: number) => {
            if (item.type === "image" || item.type === "video") {
              mediaItems.push({
                id: `${message.id}-${partIndex}-${itemIndex}`,
                type: item.type,
                url: item.url,
                width: item.width,
                height: item.height,
                messageId: message.id,
                partIndex
              });
            }
          });
        }
      });
    });

    return mediaItems;
  };

  const mediaItems = getAllMediaItems();

  // Handle keyboard navigation for modal
  useEffect(() => {
    const handleKeyDown = (e: Event) => {
      const keyboardEvent = e as globalThis.KeyboardEvent;

      if (!selectedMediaItem) return;

      if (keyboardEvent.key === 'Escape') {
        setSelectedMediaItem(null);
        return;
      }

      // Arrow key navigation
      if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowRight') {
        keyboardEvent.preventDefault();

        const currentIndex = mediaItems.findIndex(item => item.id === selectedMediaItem.id);
        if (currentIndex === -1) return;

        let nextIndex;
        if (keyboardEvent.key === 'ArrowLeft') {
          // Go to previous item (cycle to end if at beginning)
          nextIndex = currentIndex === 0 ? mediaItems.length - 1 : currentIndex - 1;
        } else {
          // Go to next item (cycle to beginning if at end)
          nextIndex = currentIndex === mediaItems.length - 1 ? 0 : currentIndex + 1;
        }

        const nextItem = mediaItems[nextIndex];
        setSelectedMediaItem({
          id: nextItem.id,
          type: nextItem.type,
          url: nextItem.url,
          width: nextItem.width,
          height: nextItem.height
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedMediaItem, mediaItems]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (selectedMediaItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedMediaItem]);

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

  const handleSubmit = () => {
    if (!props.chatId) {
      createChat().then(({ chatId }) => {
        setPrompt(promptInputRef.current?.value);
      });
      return;
    }

    if (promptInputRef.current?.value.trim()) {
      sendMessage({
        role: "user",
        text: promptInputRef.current?.value,
      });
      promptInputRef.current.value = "";
      setPromptInputValue("");
    }
  };


  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Enter without Cmd/Ctrl modifiers
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Cmd+Enter or Ctrl+Enter allows new line (default behavior)
  };


  const isLoading = status !== "ready";
  const hasMessages = messages.length > 0;

  // Notify parent component about loading state
  useEffect(() => {
    props.onLoadingChange?.(isLoading);
  }, [isLoading, props.onLoadingChange]);

  const downloadMedia = async (url: string, type: 'image' | 'video') => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      // Create a temporary download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      // Generate filename based on type and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = type === 'image' ? 'png' : 'mp4';
      link.download = `${type}_${timestamp}.${extension}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download media:', error);
    }
  };

  // Helper function to check if this is the latest assistant message
  const isLatestAssistantMessage = (message: UIMessage) => {
    // Find all assistant messages
    const assistantMessages = messages.filter(msg => msg.role === "assistant");
    if (assistantMessages.length === 0) return false;
    
    // Get the latest assistant message (last in chronological order)
    const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
    
    return message.id === latestAssistantMessage.id;
  };

  // If no messages, show welcome state
  if (!hasMessages) {
    return (
      <div className="h-full flex flex-col bg-background overflow-hidden">
        <div className="mt-20 mx-auto w-full max-w-4xl flex-1 flex flex-col items-center justify-start px-4 sm:px-6 transition-all duration-700 ease-out">
          {/* Logo */}
          <div className="flex items-center gap-3 justify-start">
            <Logo size={50}/>
            {/* <div className="flex mt-1 items-center justify-center gap-2">
              <h1 className="text-3xl font-semibold text-foreground ">Auto</h1>
            </div> */}
          </div>


          {/* Welcome Message */}
          {/* <div className="mb-8 text-center transition-all duration-500 ease-out delay-100">
            <p className="text-muted-foreground">
              Time to create something
            </p>
          </div> */}

          {/* Centered Input */}
          <div className="mt-4 w-full transition-all duration-500 ease-out delay-200">
            <div className="bg-background shadow-lg border border-gray-200 rounded-2xl p-4">
              <form onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }} className="flex items-center gap-3">
                <textarea
                  ref={promptInputRef}
                  name="prompt"
                  placeholder="What do you want to create?"
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={1}
                  value={promptInputValue}
                  onChange={(e) => setPromptInputValue(e.target.value)}
                  className={cn(
                    "flex-1 min-h-[48px] max-h-[200px] bg-background",
                    "border-0 rounded-md px-4 py-3",
                    "text-base placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-0",
                    "resize-none",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  style={{
                    height: 'auto',
                    minHeight: '48px'
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
                  className="rounded-full h-12 w-12"
                  disabled={isLoading || !promptInputValue.trim()}
                  size="icon"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-5 h-5" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Existing layout with messages
  return (
    <div className="h-full flex flex-col bg-background transition-all duration-700 ease-out">
      {/* Messages Container */}
      <div className={cn(
        "flex-1 flex flex-col pt-16 transition-all duration-500 ease-out",
        mediaItems.length > 0 ? "pb-44" : "pb-16"
      )}>
        <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 pb-4">
          <div className="flex flex-col-reverse space-y-2 space-y-reverse">
            {isLoading && (
              <div className="flex gap-2 animate-fade-in">
                <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 max-w-[calc(100%-2rem)] overflow-hidden">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {messages.slice().reverse().map((message, reverseIndex) => {
              const messageIndex = messages.length - 1 - reverseIndex;
              return (
                <div key={message.id} className="flex flex-col gap-2 animate-slide-up" style={{ animationDelay: `${reverseIndex * 50}ms` }}>
                  {message.parts.map((part, partIndex) => {
                    // Handle different part types
                    // if (part.type === "step-start") {
                    //   return (
                    //     <div key={partIndex} className="flex gap-2 justify-start">
                    //       <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    //         <Wrench className="w-3 h-3 text-white" />
                    //       </div>
                    //       <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    //         <div className="text-sm text-blue-700 font-medium">
                    //           Starting analysis...
                    //         </div>
                    //       </div>
                    //     </div>
                    //   );
                    // }

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
                            "max-w-[calc(100%-2rem)] min-w-0 overflow-hidden",
                            isCompleted
                              ? "bg-green-50 border-green-200"
                              : "bg-orange-50 border-orange-200",
                            isCollapsed ? "px-3 py-1" : "px-3 py-2"
                          )}
                            onClick={() => isCompleted && toggleToolCollapse(toolId)}
                          >
                            <div className="flex flex-col items-start">
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
                                <div className="text-xs text-gray-600 mb-2 text-start break-words">
                                  <strong>Query:</strong> {(part as any).input.query || JSON.stringify((part as any).input)}
                                </div>
                              )}

                              {!isCollapsed && (part as any).output && isCompleted && (
                                <div className="text-xs text-gray-600 w-full">
                                  {Array.isArray((part as any).output) ? (
                                    // Check if this is an array of media items (images/videos)
                                    (part as any).output.length > 0 && ((part as any).output[0].type === "image" || (part as any).output[0].type === "video") ? (
                                      <div className="w-full">
                                        <strong>Generated {(part as any).output.length} media item{(part as any).output.length > 1 ? 's' : ''}</strong>
                                        <div className="mt-2 grid grid-cols-1 gap-2 w-full">
                                          {(part as any).output.map((item: any, i: number) => (
                                            <div key={i} className="bg-white rounded border p-2 w-full">
                                              <div className="font-medium text-gray-800 mb-1">
                                                {item.type === "image" ? "🖼️" : "🎥"} {item.type === "image" ? "Image" : "Video"} {i + 1}
                                              </div>
                                              <MediaItem
                                                item={{
                                                  id: `${message.id}-${partIndex}-${i}`,
                                                  type: item.type,
                                                  url: item.url,
                                                  width: item.width,
                                                  height: item.height
                                                }}
                                                className="w-full max-w-full h-auto rounded border max-h-48 object-contain"
                                                style={{ maxWidth: '100%', width: '100%' }}
                                                showDimensions={item.type === "image"}
                                                controls={item.type === "video"}
                                                onClick={() => setSelectedMediaItem({
                                                  id: `${message.id}-${partIndex}-${i}`,
                                                  type: item.type,
                                                  url: item.url,
                                                  width: item.width,
                                                  height: item.height
                                                })}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      // Default handling for other arrays (like search results)
                                      <div className="w-full">
                                        <strong>Found {(part as any).output.length} results</strong>
                                        {(part as any).output.slice(0, 2).map((result: any, i: number) => (
                                          <div key={i} className="mt-1 p-1 bg-white rounded border w-full overflow-hidden">
                                            <div className="font-medium text-gray-800 break-words">{result.title}</div>
                                            <div className="text-gray-500 break-words">{result.content?.substring(0, 100)}...</div>
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
                                    <div className="break-words"><strong>Output:</strong> {JSON.stringify((part as any).output).substring(0, 200)}...</div>
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

                      // Check if this is the last text part of the latest assistant message
                      const isLastTextPartOfLatestMessage = message.role === "assistant" && 
                        isLatestAssistantMessage(message) && 
                        partIndex === message.parts.map((p, i) => p.type === "text" && p.text.trim() ? i : -1).filter(i => i >= 0).pop();

                      return (
                        <div key={partIndex} className={cn(
                          "flex gap-2",
                          message.role === "user" ? "justify-end" : "justify-start"
                        )}>
                          {message.role === "assistant" && (
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                              {isLastTextPartOfLatestMessage && isLoading ? (
                                <Logo size={24} isListening={true} static={false} />
                              ) : null}
                            </div>
                          )}

                          <div className={cn(
                            "max-w-[85%] sm:max-w-[80%] md:max-w-[75%] rounded-lg px-3 py-2",
                            "min-w-0 overflow-hidden",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}>
                            <div className="whitespace-pre-wrap text-start break-words">
                              {part.text}
                            </div>
                          </div>

                          {/* {message.role === "user" && (
                            <div className="flex-shrink-0 w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )} */}
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 mx-auto max-w-4xl inset-x-0 fixed bottom-0 w-full transition-all duration-500 ease-out px-3 sm:px-6">
        {/* Media Gallery */}
        <div className="bg-background shadow-lg border border-gray-200 rounded-t-2xl px-2 gap-2 flex flex-col pb-2">
          {mediaItems.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pt-2">
              {mediaItems.map((item) => (
                <div key={item.id} className="flex-shrink-0 relative group rounded-lg overflow-hidden border hover:-translate-y-2 transition-transform duration-200 ease-out">
                  <MediaItem
                    item={item}
                    imageClassName="h-16 w-16 object-cover"
                    onClick={() => setSelectedMediaItem(item)}
                    muted={item.type === 'video'}
                  />
                </div>
              ))}
            </div>
          )}

          <div className={
            cn(
              mediaItems.length == 0 ? "pt-2" : "pb-0",
            )
          }>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }} className="flex items-center gap-2 px-2">
              {!isLoading && hasMessages && (
                <div className="flex-shrink-0 flex items-center justify-center">
                  <Logo size={30} isListening={false} static={false} />
                </div>
              )}
              <textarea
                ref={promptInputRef}
                name="prompt"
                placeholder="What do you want to create?"
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                value={promptInputValue}
                onChange={(e) => setPromptInputValue(e.target.value)}
                className={cn(
                  "flex-1 min-h-[40px] max-h-[200px] bg-background",
                  "border-input rounded-md pr-3 py-2",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none ",
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
                className="rounded-full"
                disabled={isLoading || !promptInputValue.trim()}
                size="icon"
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

            {/* Disclaimer notices */}
            <div className="px-2 pb-1">
              <p className="text-xs text-muted-foreground text-center break-words">
                This is a research preview. Your chat data is public and AI can make mistakes.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* Media Modal */}
      {selectedMediaItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setSelectedMediaItem(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Action buttons */}
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              {/* Download button */}
              <button
                onClick={() => downloadMedia(selectedMediaItem.url, selectedMediaItem.type)}
                className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Close button */}
              <button
                onClick={() => setSelectedMediaItem(null)}
                className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation indicators */}
            {mediaItems.length > 1 && (
              <>
                {/* Current item indicator */}
                <div className="absolute top-2 left-2 z-10">
                  <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                    {mediaItems.findIndex(item => item.id === selectedMediaItem.id) + 1} / {mediaItems.length}
                  </div>
                </div>

                {/* Navigation hint */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-black/50 text-white text-xs px-3 py-1 rounded flex items-center gap-2">
                    <span>←</span>
                    <span>Navigate</span>
                    <span>→</span>
                  </div>
                </div>
              </>
            )}

            {/* Media content */}
            <MediaItem
              item={selectedMediaItem}
              className="max-w-full max-h-full object-contain"
              style={{
                maxWidth: selectedMediaItem.width ? selectedMediaItem.width : '90vw',
                maxHeight: selectedMediaItem.height ? selectedMediaItem.height : '90vh',
                width: '100%',
                height: '100%',
                // minWidth: ,
                // minHeight: selectedMediaItem.height ? selectedMediaItem.height : '200px'
              }}
              controls={selectedMediaItem.type === 'video'}
              autoPlay={selectedMediaItem.type === 'video'}
            />
          </div>
        </div>
      )}
    </div>
  );
}