import "./index.css";
import { Chat } from "./Chat";
import { Header } from "./components/ui/header";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery, useMutation, QueryClient, hydrate } from "@tanstack/react-query";
import { cn } from "./lib/utils";
import { isReadOnlyChat } from "./lib/constants";
import { trackChatEvent } from "./lib/analytics";
import { PostHogProvider } from "posthog-js/react";
import { NuqsAdapter } from 'nuqs/adapters/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from "@/components/ui/sonner"
import { useChatIdFromPath } from "./hooks/useChatIdFromPath";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL } from "@/lib/models";

const queryClient = new QueryClient();

function PostHogProviderWrapper({ children }: { children: React.ReactNode }) {
  if (process.env.BUN_PUBLIC_POSTHOG_KEY) {
    return (
      <PostHogProvider apiKey={process.env.BUN_PUBLIC_POSTHOG_KEY} options={{
        api_host: process.env.BUN_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
      }}>
        {children}
      </PostHogProvider>
    )
  }
  return children;
}

export function AppWrapper({
  serverChatId,
  serverMessages = [],
  dehydratedState
}: {
  serverChatId?: string;
  serverMessages?: any[];
  dehydratedState?: any;
} = {}) {
  // Hydrate the query client with server state if available
  if (dehydratedState) {
    hydrate(queryClient, dehydratedState);
  }

  // console.log(dehydratedState);

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <PostHogProviderWrapper>
          <App
            serverChatId={serverChatId}
            serverMessages={serverMessages}
          />
          <Toaster />
        </PostHogProviderWrapper>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}

export function App({
  serverChatId,
  serverMessages = [],
  defaultChatId = ''
}: {
  serverChatId?: string;
  serverMessages?: any[];
  defaultChatId?: string;
}) {
  const [chatId, setChatId, selectedModel, setSelectedModel] = useChatIdFromPath({
    defaultValue: serverChatId || defaultChatId,
    serverChatId, // Pass server chat ID to the hook
    defaultModel: DEFAULT_TEXT_MODEL,
    history: 'push' // Use pushState instead of replaceState for proper browser history
  });

  // Load stored model from localStorage if no URL parameter
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const hasModelParam = params.has('model');
        const stored = localStorage.getItem('selectedModel');
        if (!hasModelParam && stored && !selectedModel) {
          setSelectedModel(stored);
        }
      }
    } catch {}
  }, [selectedModel, setSelectedModel]);



  // Check if current chat is read-only (example chat)
  const isExampleReadOnly = isReadOnlyChat(chatId);

  // Query to check if chat is published (and thus read-only)
  const { data: publishStatus } = useQuery({
    queryKey: ['chat-published', chatId],
    queryFn: async () => {
      if (!chatId || isExampleReadOnly) return { published: false };
      const response = await fetch(`/api/chat/${chatId}/published`);
      if (!response.ok) return { published: false };
      return response.json();
    },
    enabled: !!chatId && !isExampleReadOnly,
    staleTime: 30000, // Cache for 30 seconds
  });

  const isReadOnly = isExampleReadOnly || (publishStatus?.published || false);

  const { data: messages, isLoading: isLoadingMessages, isEnabled } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetch(`/api/chat?chatId=${chatId}`).then(res => res.json()),
    enabled: !!chatId,
    initialData: serverMessages.length > 0 ? serverMessages : undefined, // Use server data as initial data
  });

  const [hasMessages, setHasMessages] = useState(messages?.length > 0);
  const [isLoading, setIsLoading] = useState(false);

  // Update hasMessages when messages are loaded
  useEffect(() => {
    if (messages) {
      setHasMessages(messages.length > 0);
    }
  }, [messages]);

  const { mutateAsync: createChat, isPending: isCreatingChat } = useMutation<{ chatId: string }>({
    mutationFn: async () => {
      const response = await fetch('/api/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
        }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      trackChatEvent('start_chat');
      setChatId(data.chatId, selectedModel);
    }
  });
  
  useEffect(() => {
    try {
      if (selectedModel) {
        localStorage.setItem('selectedModel', selectedModel);
      }
    } catch {}
  }, [selectedModel]);

  const handleNewChat = () => {
    createChat();
  };

  const handleMessagesChange = (newHasMessages: boolean) => {
    setHasMessages(newHasMessages);
  };

  const handleLoadingChange = (newIsLoading: boolean) => {
    setIsLoading(newIsLoading);
  };

  if (isLoadingMessages && isEnabled) {
    // console.log("isLoadingMessages", isLoadingMessages);
    // console.log("isEnabled", isEnabled);
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 "></div>
      </div>
    );
  }

  console.log("hasMessages", hasMessages);

  return (
    <div className={cn("w-screen flex flex-col", !hasMessages ? 'h-screen' : "min-h-screen h-full")}>
      {/* Always render header */}
      <div className="sticky top-0 z-20">
        <Header 
          onNewChat={handleNewChat} 
          isCreatingChat={isCreatingChat} 
          isListening={isLoading} 
          isReadOnly={isReadOnly} 
          chatId={chatId} 
          isExampleChat={isExampleReadOnly}
          selectedModel={selectedModel}
          onChangeModel={setSelectedModel}
          availableModels={TEXT_MODELS}
        />
      </div>

      <div className={`flex-1 text-center relative z-10 transition-all duration-500 ease-out overflow-hidden ${hasMessages ? '' : 'pt-0'}`}>
        <Chat
          key={chatId}
          initialMessages={messages}
          chatId={chatId}
          setChatId={setChatId}
          onMessagesChange={handleMessagesChange}
          onLoadingChange={handleLoadingChange}
          isReadOnly={isReadOnly}
          selectedModel={selectedModel}
        />
      </div>
    </div>
  );
}

export default App;
