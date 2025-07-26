import React from "react";
import { Button } from "./button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/components/icon.svg";

interface HeaderProps {
  onNewChat?: () => void;
  isCreatingChat?: boolean;
  className?: string;
}

export function Header({ onNewChat, isCreatingChat, className }: HeaderProps) {
  return (
    <header className={cn(
      "w-full border-b border-border/40 bg-background/80 backdrop-blur-sm",
      "flex items-center justify-between px-6 py-3",
      className
    )}>
      <div className="flex items-center gap-3 justify-center">
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="127" height="97" viewBox="0 0 127 97" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#paint0_angular_30_13_clip_path)">
              <g transform="matrix(-2.65411e-09 0.060719 -0.060719 -2.65411e-09 63.5 48.327)">
                <foreignObject x="-2117.94" y="-2117.94" width="4235.88" height="4235.88">
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{ background: "conic-gradient(from 90deg, rgba(0, 0, 0, 1) 0deg, rgba(53, 53, 53, 1) 180deg, rgba(123, 123, 123, 1) 360deg)", height: "100%", width: "100%", opacity: 1 }} />
                </foreignObject>
              </g>
            </g>
            <path fillRule="evenodd" clipRule="evenodd" d="M95.6471 96.6539C90.3722 96.6539 86.0961 92.3778 86.0961 87.103V63.5C86.0961 51.0205 75.9795 40.9039 63.5 40.9039C51.0206 40.9039 40.904 51.0205 40.9039 63.5V87.103C40.9039 92.3778 36.6278 96.654 31.353 96.654H9.55107C4.27621 96.654 8.09648e-05 92.3778 8.11954e-05 87.103L8.22271e-05 63.5C8.37601e-05 28.4299 28.43 -1.53296e-06 63.5 0C98.5701 1.53296e-06 127 28.4299 127 63.5V87.103C127 92.3778 122.724 96.6539 117.449 96.6539H95.6471Z" />
            <defs>
              <clipPath id="paint0_angular_30_13_clip_path">
                <path fillRule="evenodd" clipRule="evenodd" d="M95.6471 96.6539C90.3722 96.6539 86.0961 92.3778 86.0961 87.103V63.5C86.0961 51.0205 75.9795 40.9039 63.5 40.9039C51.0206 40.9039 40.904 51.0205 40.9039 63.5V87.103C40.9039 92.3778 36.6278 96.654 31.353 96.654H9.55107C4.27621 96.654 8.09648e-05 92.3778 8.11954e-05 87.103L8.22271e-05 63.5C8.37601e-05 28.4299 28.43 -1.53296e-06 63.5 0C98.5701 1.53296e-06 127 28.4299 127 63.5V87.103C127 92.3778 122.724 96.6539 117.449 96.6539H95.6471Z" />
              </clipPath>
            </defs>
          </svg>
        </div>
        <div className="flex mt-1 items-center justify-center gap-2">
          <h1 className="text-lg font-semibold text-foreground ">Auto</h1>
          {/* <p className="text-xs text-muted-foreground">Your Creative Agent</p> */}
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