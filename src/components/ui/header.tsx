import React from "react";
import { Button } from "./button";
import { Plus, Eye, ExternalLink, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/components/icon.svg";
import { Logo } from "./logo";

interface HeaderProps {
  onNewChat?: () => void;
  isCreatingChat?: boolean;
  isListening?: boolean;
  isReadOnly?: boolean;
  className?: string;
}

export function Header({ onNewChat, isCreatingChat, isListening = false, isReadOnly = false, className }: HeaderProps) {
  return (
    <header className={cn(
      "w-full border-b border-border/40 bg-background/80 backdrop-blur-sm",
      "flex items-center justify-between px-6 py-3",
      className
    )}>
      <div className="flex items-center gap-3 justify-center">
        <Logo isListening={isListening} static={true}/>
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-lg font-semibold text-foreground ">Auto</h1>
          {isReadOnly && (
            <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 border border-orange-200 rounded-md">
              <Eye className="w-3 h-3 text-orange-600" />
              <span className="text-xs font-medium text-orange-700">Read-only Example</span>
            </div>
          )}
        </div>
      </div>

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