import "./index.css";
import { Chat } from "./Chat";
import { Header } from "./components/ui/header";
import { useQueryState } from 'nuqs'
import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery, useMutation } from "@tanstack/react-query";

export function App() {
  const [chatId, setChatId] = useQueryState('chatId', { defaultValue: '' });
  const [hasMessages, setHasMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: messages, isLoading: isLoadingMessages, isEnabled } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetch(`/api/chat?chatId=${chatId}`).then(res => res.json()),
    enabled: !!chatId,
  })

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
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatId(data.chatId);
    }
  });

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
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 "></div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      {/* Conditionally render header with animation */}
      <div className={`sticky top-0 z-20 transition-all duration-500 ease-out ${
        hasMessages 
          ? 'translate-y-0 opacity-100' 
          : '-translate-y-full opacity-0 pointer-events-none'
      }`}>
        <Header onNewChat={handleNewChat} isCreatingChat={isCreatingChat} isListening={isLoading} />
      </div>
      
      <div className={`flex-1 text-center relative z-10 transition-all duration-500 ease-out overflow-hidden ${
        hasMessages ? '' : 'pt-0'
      }`}>
        <Chat 
          key={chatId} 
          initialMessages={messages} 
          chatId={chatId} 
          onMessagesChange={handleMessagesChange}
          onLoadingChange={handleLoadingChange}
        />
      </div>
    </div>
  );
}

export default App;
