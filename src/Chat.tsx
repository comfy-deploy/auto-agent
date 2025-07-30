import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { ArrowUp, Loader2, Search, Globe, Code, ChevronDown, ChevronRight, X, Download, MessageSquare, Play, Share2, Lock } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MediaItem } from "@/components/MediaItem";
import { MediaGallery } from "@/components/MediaGallery";
import { Logo } from "./components/ui/logo";
import ReactMarkdown from "react-markdown";
import { isReadOnlyChat } from "@/lib/constants";
import { trackChatEvent } from "@/lib/analytics";

export function Chat(props: {
  initialMessages: UIMessage[];
  chatId: string;
  onMessagesChange?: (hasMessages: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}) {
  const [_, setChatId] = useQueryState('chatId', { 
    history: 'push' // Use pushState for proper browser history
  })
  const [prompt, setPrompt] = useQueryState("prompt", {
    history: 'push' // Use pushState for proper browser history
  });
  const lastSentPrompt = useRef("");
  const [promptInputValue, setPromptInputValue] = useState("");

  console.log("props.chatId", props.chatId);

  // Check if current chat is read-only (example chat or published chat)
  const isReadOnly = isReadOnlyChat(props.chatId) || publishStatus?.published;

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
    if (prompt && props.chatId && lastSentPrompt.current !== prompt && !isReadOnly) {
      lastSentPrompt.current = prompt;
      trackChatEvent('send_message');
      sendMessage({
        role: "user",
        text: prompt,
      });
      setPrompt(null);
    }
  }, [prompt, props.chatId, isReadOnly]);

  const { mutateAsync: createChat, isPending: isCreatingChat } = useMutation<{ chatId: string }>({
    mutationFn: async () => {
      const response = await fetch('/api/chat/new', {
        method: 'POST',
      });
      return response.json();
    },
    onSuccess: (data) => {
      trackChatEvent('start_chat');
      setChatId(data.chatId);
    }
  });

  // Fetch example chats for the welcome screen
  const { data: exampleChats = [], isLoading: isLoadingExamples } = useQuery({
    queryKey: ['exampleChats'],
    queryFn: async () => {
      const response = await fetch('/api/chat/examples');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Query for publish status
  const { data: publishStatus, refetch: refetchPublishStatus } = useQuery({
    queryKey: ['publishStatus', props.chatId],
    queryFn: async () => {
      if (!props.chatId || isReadOnlyChat(props.chatId)) return { published: false };
      const response = await fetch(`/api/chat/${props.chatId}/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch publish status');
      }
      return response.json();
    },
    enabled: !!props.chatId && !isReadOnlyChat(props.chatId)
  });

  // Mutation for publishing/unpublishing
  const publishMutation = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const method = publish ? 'POST' : 'DELETE';
      const response = await fetch(`/api/chat/${props.chatId}/publish`, {
        method,
      });
      if (!response.ok) {
        throw new Error(`Failed to ${publish ? 'publish' : 'unpublish'} chat`);
      }
      return response.json();
    },
    onSuccess: () => {
      refetchPublishStatus();
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
    if (isReadOnly) return; // Don't resume for read-only chats

    if (!isLastMessageFromUser) {
      return;
    }

    if (!resumed.current) {
      resumeStream();
      resumed.current = true;
    }
    // We want to disable the exhaustive deps rule here because we only want to run this effect once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastMessageFromUser, isReadOnly]);

  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set());
  const [autoCollapsedTools, setAutoCollapsedTools] = useState<Set<string>>(new Set());
  const [selectedMediaItem, setSelectedMediaItem] = useState<{ id: string, type: 'image' | 'video', url: string, width?: number, height?: number } | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'images' | 'videos'>('all');

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Extract all media items from messages
  const getAllMediaItems = () => {
    const mediaItems: Array<{ id: string, type: 'image' | 'video', url: string, width?: number, height?: number, messageId: string, partIndex: number }> = [];

    messages.forEach((message) => {
      message.parts.forEach((part, partIndex) => {
        if (part.type?.startsWith("tool-") && (part as any).output && Array.isArray((part as any).output)) {
          (part as any).output.forEach((item: any, itemIndex: number) => {
            if (item.type === "image" || item.type === "video") {
              // Handle cases where url is an object with nested url property
              const extractedUrl = typeof item.url === 'object' && item.url?.url ? item.url.url : item.url;
              
              mediaItems.push({
                id: `${message.id}-${partIndex}-${itemIndex}`,
                type: item.type,
                url: extractedUrl,
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
  const filteredMediaItems = mediaItems.filter(item => 
    mediaFilter === 'all' || item.type === mediaFilter.slice(0, -1) // 'images' -> 'image', 'videos' -> 'video'
  );

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

        const currentIndex = filteredMediaItems.findIndex(item => item.id === selectedMediaItem.id);
        if (currentIndex === -1) return;

        let nextIndex;
        if (keyboardEvent.key === 'ArrowLeft') {
          // Go to previous item (cycle to end if at beginning)
          nextIndex = currentIndex === 0 ? filteredMediaItems.length - 1 : currentIndex - 1;
        } else {
          // Go to next item (cycle to beginning if at end)
          nextIndex = currentIndex === filteredMediaItems.length - 1 ? 0 : currentIndex + 1;
        }

        const nextItem = filteredMediaItems[nextIndex];
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
  }, [selectedMediaItem, filteredMediaItems]);

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
    // Prevent submission for read-only chats
    if (isReadOnly) return;

    if (!props.chatId) {
      createChat().then(({ chatId }) => {
        setPrompt(promptInputRef.current?.value);
      });
      return;
    }

    if (promptInputRef.current?.value.trim()) {
      trackChatEvent('send_message');
      sendMessage({
        role: "user",
        text: promptInputRef.current?.value,
      });
      promptInputRef.current.value = "";
      setPromptInputValue("");
    }
  };

  // Handle "Try now" functionality for read-only chats
  const handleTryNow = () => {
    // Get the first user message from the current chat
    const firstUserMessage = messages.find(msg => msg.role === "user");
    if (firstUserMessage) {
      // Extract text from parts array
      let initialPrompt = '';
      if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
        const textPart = firstUserMessage.parts.find(part => part.type === 'text');
        if (textPart && 'text' in textPart) {
          initialPrompt = textPart.text;
        }
      }

      // Create new chat and set the initial prompt
      if (initialPrompt) {
        createChat().then(({ chatId }) => {
          setPrompt(initialPrompt);
        });
      } else {
        // If no text found, just create a new chat
        createChat();
      }
    } else {
      // If no user message found, just create a new chat
      createChat();
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
      <div className="h-full flex flex-col bg-background">
        <div className="mt-8 mx-auto w-full max-w-4xl flex-1 flex flex-col items-center justify-start px-4 sm:px-6 transition-all duration-700 ease-out">
          {/* Logo */}
          <div className="flex items-center gap-3 justify-start">
            <Logo size={50}/>
          </div>

          {/* Centered Input */}
          <div className="mt-8 w-full transition-all duration-500 ease-out delay-200">
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

          {/* Example Chats */}
          {exampleChats.length > 0 && (
            <div className="mt-6 w-full max-w-2xl transition-all duration-500 ease-out delay-300">
              <p className="text-sm text-muted-foreground mb-3 text-center">
                Get inspired by these creations
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {exampleChats.map((example: any) => (
                  <button
                    key={example.id}
                    onClick={() => {
                      trackChatEvent('view_example');
                      setChatId(example.id);
                    }}
                    className="inline-flex items-center gap-2 p-3 bg-background border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200 group max-w-xs"
                  >
                    {/* Images Preview */}
                    {example.images && example.images.length > 0 && (
                      <div className="flex-shrink-0">
                        {example.images.length === 1 ? (
                          <img 
                            src={example.images[0]} 
                            alt="" 
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="relative w-10 h-10">
                            <img 
                              src={example.images[0]} 
                              alt="" 
                              className="absolute inset-0 w-full h-full rounded-lg object-cover"
                            />
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-medium">
                              {example.images.length}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="font-medium text-sm text-foreground truncate">
                        {example.title}
                      </h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MessageSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {example.messageCount} messages
                        </span>
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex-shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
                      <ArrowUp className="w-3 h-3 rotate-45" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
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
        mediaItems.length > 0 ? "pb-64" : "pb-20"
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
                                        <div className="mt-2">
                                          <MediaGallery
                                            items={(part as any).output.map((item: any, i: number) => ({
                                              id: `${message.id}-${partIndex}-${i}`,
                                              type: item.type,
                                              url: typeof item.url === 'object' && item.url?.url ? item.url.url : item.url,
                                              width: item.width,
                                              height: item.height
                                            }))}
                                            onItemClick={(item) => setSelectedMediaItem(item)}
                                            showLabels={true}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      // Default handling for other arrays (like search results)
                                      <div className="w-full">
                                        <strong>Found {(part as any).output.length} results</strong>
                                        {(part as any).output.slice(0, 2).map((result: any, i: number) => (
                                          <div key={i} className="mt-1 p-1 bg-white rounded border w-full overflow-hidden">
                                            <div className="font-medium text-gray-800 break-words">{result.title}</div>
                                            <div className="text-gray-500 break-words">{result.content ? result.content?.substring(0, 100) : result}...</div>
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
                            <ReactMarkdown 
                              components={{
                                p: ({ children }) => <p className="mb-4 last:mb-0 text-start break-words">{children}</p>,
                                ul: ({ children }) => <ul className="mb-4 text-start break-words list-disc list-inside">{children}</ul>,
                                ol: ({ children }) => <ol className="mb-4 text-start break-words list-decimal list-inside">{children}</ol>,
                                li: ({ children }) => <li className="mb-1 text-start break-words">{children}</li>,
                                h1: ({ children }) => <h1 className="mb-4 text-start break-words font-semibold text-lg">{children}</h1>,
                                h2: ({ children }) => <h2 className="mb-4 text-start break-words font-semibold text-base">{children}</h2>,
                                h3: ({ children }) => <h3 className="mb-4 text-start break-words font-semibold">{children}</h3>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                              }}
                            >
                              {part.text}
                            </ReactMarkdown>
                          </div>

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
            <div className="pt-2">
              {/* Filter Controls */}
              <div className="flex gap-1 mb-2">
                {['all', 'images', 'videos'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setMediaFilter(filter as any)}
                    className={cn(
                      "px-2 py-1 rounded text-xs transition-colors capitalize",
                      mediaFilter === filter 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {filter} {filter !== 'all' && `(${mediaItems.filter(item => item.type === filter.slice(0, -1)).length})`}
                  </button>
                ))}
              </div>
              
              {/* Media Items */}
              <MediaGallery
                items={filteredMediaItems}
                onItemClick={(item) => setSelectedMediaItem(item)}
              />
            </div>
          )}

          <div className={
            cn(
              mediaItems.length == 0 ? "pt-2" : "pb-0",
            )
          }>
            {isReadOnly ? (
              // Read-only mode: Show "Try now" button
              <div className="px-2">
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="flex-1 text-left">
                    <p className="text-sm text-muted-foreground font-medium">
                      {publishStatus?.published ? "This is a published chat" : "This is a read-only example"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {publishStatus?.published ? "This conversation has been published and is read-only" : "Create your own version to continue the conversation"}
                    </p>
                  </div>
                  <Button
                    onClick={handleTryNow}
                    disabled={isCreatingChat}
                    className="flex items-center gap-2 rounded-full px-4 py-2 flex-shrink-0"
                  >
                    {isCreatingChat ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Try now</span>
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Disclaimer notices */}
                <div className="pb-1">
                  <p className="text-xs text-muted-foreground text-center break-words">
                    This is a research preview. Your chat data is public and AI can make mistakes.
                  </p>
                </div>
              </div>
            ) : (
              // Regular mode: Show input form
              <>
                <div className="px-2">
                  {/* Publish button for non-readonly chats with messages */}
                  {!isReadOnlyChat(props.chatId) && hasMessages && (
                    <div className="flex justify-center mb-2">
                      <Button
                        variant={publishStatus?.published ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => publishStatus?.published ? null : publishMutation.mutate({ publish: true })}
                        disabled={publishMutation.isPending || publishStatus?.published}
                        className="flex items-center gap-2"
                      >
                        {publishMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : publishStatus?.published ? (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>Published</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-4 h-4" />
                            <span>Publish</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }} className="flex items-center gap-2">
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
                  <div className="pb-1">
                    <p className="text-xs text-muted-foreground text-center break-words">
                      This is a research preview. Your chat data is public and AI can make mistakes.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Media Modal */}
      {selectedMediaItem && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setSelectedMediaItem(null)}
        >
          <div
            className="relative flex items-center justify-center max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden"
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
            {filteredMediaItems.length > 1 && (
              <>
                {/* Current item indicator */}
                <div className="absolute top-2 left-2 z-10">
                  <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                    {filteredMediaItems.findIndex(item => item.id === selectedMediaItem.id) + 1} / {filteredMediaItems.length}
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
              imageClassName="max-w-full max-h-full object-contain"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
              }}
              controls={selectedMediaItem.type === 'video'}
              autoPlay={selectedMediaItem.type === 'video'}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}