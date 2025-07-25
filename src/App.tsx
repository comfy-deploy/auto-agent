import "./index.css";
import { Chat } from "./Chat";
import { useQueryState } from 'nuqs'
import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";

export function App() {
  const [chatId, setChatId] = useQueryState('chatId')

  const { data: messages, isLoading, isEnabled } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetch(`/api/chat?chatId=${chatId}`).then(res => res.json()),
    enabled: !!chatId,
  })

  if (isLoading && isEnabled) {
    return <div>Loading...</div>
  }

  return (
    <div className="text-center relative z-10 w-screen h-screen">
      <Chat key={chatId} initialMessages={messages} chatId={chatId} />
    </div>
  );
}

export default App;
