import React from "react";
import { Button } from "./button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/components/icon.svg";
import { Logo } from "./logo";

interface HeaderProps {
  onNewChat?: () => void;
  isCreatingChat?: boolean;
  isListening?: boolean;
  className?: string;
}

export function Header({ onNewChat, isCreatingChat, isListening = false, className }: HeaderProps) {
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
        </div>
      </div>

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
    </header>
  );
} 