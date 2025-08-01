import React from "react";
import { Button } from "./button";
import { Plus, Eye, ExternalLink, Github, Share, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/components/icon.svg";
import { Logo } from "./logo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface HeaderProps {
  onNewChat?: () => void;
  isCreatingChat?: boolean;
  isListening?: boolean;
  isReadOnly?: boolean;
  className?: string;
  chatId?: string;
  isExampleChat?: boolean;
}

export function Header({ onNewChat, isCreatingChat, isListening = false, isReadOnly = false, className, chatId, isExampleChat = false }: HeaderProps) {
  const queryClient = useQueryClient();

  // Query to get publish status
  const { data: publishStatus, isLoading: isLoadingPublishStatus } = useQuery({
    queryKey: ['chat-published', chatId],
    queryFn: async () => {
      if (!chatId) return { published: false };
      const response = await fetch(`/api/chat/${chatId}/published`);
      if (!response.ok) throw new Error('Failed to check publish status');
      return response.json();
    },
    enabled: !!chatId, // Don't check for example chats
    staleTime: 30000, // Cache for 30 seconds
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (action: 'publish' | 'unpublish') => {
      if (!chatId) throw new Error('No chat ID');
      const response = await fetch(`/api/chat/${chatId}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to ${action} chat`);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch publish status
      queryClient.invalidateQueries({ queryKey: ['chat-published', chatId] });
    },
  });

  const isPublished = publishStatus?.published || false;
  const canPublish = chatId;

  const handlePublishToggle = () => {
    if (!canPublish) return;
    const action = isPublished ? 'unpublish' : 'publish';
    publishMutation.mutate(action);
  };

  return (
    <header className={cn(
      "w-full border-b border-border/40 bg-background/80 backdrop-blur-sm",
      "flex items-center justify-between px-6 py-3",
      className
    )}>
      <a href="/">
        <div className="flex items-center gap-3 justify-center">
          <Logo isListening={isListening} static={true} />
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-lg font-semibold text-foreground ">Auto</h1>
            {isExampleChat && (
              <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 border border-orange-200 rounded-md">
                <Eye className="w-3 h-3 text-orange-600" />
                <span className="text-xs font-medium text-orange-700">Example</span>
              </div>
            )}
            {isPublished && !isExampleChat && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 border border-green-200 rounded-md">
                <Share className="w-3 h-3 text-green-600" />
                <span className="text-xs font-medium text-green-700">Published</span>
              </div>
            )}
          </div>
        </div>

      </a>
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-2"
        >
          <a href="https://github.com/comfy-deploy/auto-agent" target="_blank" rel="noopener noreferrer">
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </Button>

        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-2"
        >
          <a href="https://discord.gg/qwNxh7VUjS" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4" />
            Discord
          </a>
        </Button>

        {canPublish && !isPublished && (
          <Button
            onClick={handlePublishToggle}
            disabled={publishMutation.isPending || isLoadingPublishStatus}
            variant={isPublished ? "outline" : "default"}
            size="sm"
            className="gap-2"
          >
            {publishMutation.isPending || isLoadingPublishStatus ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPublished ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Share className="w-4 h-4" />
            )}
            {isPublished ? "Unpublish" : "Publish"}
          </Button>
        )}

        <Button
          onClick={onNewChat}
          disabled={isCreatingChat}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New
        </Button>
      </div>
    </header>
  );
} 