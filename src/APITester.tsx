import React, { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function APITester() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (isLoading) return; // Prevent multiple submissions

    const prompt = promptInputRef.current?.value.trim();
    if (!prompt) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      responseInputRef.current!.value = JSON.stringify(data, null, 2);
    } catch (error) {
      responseInputRef.current!.value = String(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="mt-8 mx-auto w-full text-left flex flex-col gap-4">
      <form
        onSubmit={sendMessage}
        className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-input w-full"
      >
        <div className="relative">
          <textarea
            ref={promptInputRef}
            name="prompt"
            placeholder="Enter your message here... (Cmd+Enter to send)"
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className={cn(
              "w-full min-h-[100px] bg-transparent",
              "border border-input rounded-lg p-3",
              "font-mono resize-y",
              "placeholder:text-muted-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            required
          />
          {isLoading && (
            <div className="absolute inset-0 bg-background/50 rounded-lg flex items-center justify-center">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        <Button 
          type="submit" 
          className="self-end" 
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
              Sending...
            </>
          ) : (
            "Send Message"
          )}
        </Button>
      </form>

      <textarea
        ref={responseInputRef}
        readOnly
        placeholder="Response will appear here..."
        className={cn(
          "w-full min-h-[140px] bg-card",
          "border border-input rounded-xl p-3",
          "font-mono resize-y",
          "placeholder:text-muted-foreground"
        )}
      />
    </div>
  );
}
