import "./index.css";
import { Chat } from "./Chat";
import { Header } from "./components/ui/header";
import { useQueryState } from 'nuqs'
import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery, useMutation } from "@tanstack/react-query";

export function App() {
  const [chatId, setChatId] = useQueryState('chatId')

  const { data: messages, isLoading, isEnabled } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetch(`/api/chat?chatId=${chatId}`).then(res => res.json()),
    enabled: !!chatId,
  })

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

  if (isLoading && isEnabled) {
    return (
      <div className="w-screen h-screen flex flex-col">
        <Header onNewChat={handleNewChat} isCreatingChat={isCreatingChat} />
        <div className="flex-1 flex items-center justify-center">
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col">
      <Header onNewChat={handleNewChat} isCreatingChat={isCreatingChat} />
      <div className="flex-1 text-center relative z-10">
        <Chat key={chatId} initialMessages={messages} chatId={chatId} />
      </div>
    </div>
  );
}

export default App;
