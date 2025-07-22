import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: {
    name: string;
    parameters: any;
    result?: any;
  };
}

interface MessageDisplayProps {
  messages: Message[];
  streaming?: boolean;
}

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  if (isTool) {
    return (
      <div className="flex justify-center my-2">
        <Badge variant="outline" className="text-xs px-2 py-1">
          <span className="mr-1">🔧</span>
          {message.toolCall?.name || 'Tool'} executed
        </Badge>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div className="flex items-center mb-1">
          <Badge variant={isUser ? "default" : "secondary"} className="text-xs">
            {isUser ? '👤 You' : '🤖 Assistant'}
          </Badge>
        </div>
        <Card className={`p-3 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
          {isAssistant && message.content.includes('**') ? (
            <div className="text-sm whitespace-pre-wrap">
              {message.content.split('\n').map((line, i) => (
                <div key={i}>
                  {line.split(/(\*\*[^*]+\*\*)/).map((part, j) => 
                    part.startsWith('**') && part.endsWith('**') ? (
                      <strong key={j}>{part.slice(2, -2)}</strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ messages, streaming = false }) => {
  return (
    <ScrollArea className="h-full w-full p-2">
      <div className="space-y-1">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {streaming && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[80%]">
              <div className="flex items-center mb-1">
                <Badge variant="secondary" className="text-xs">
                  🤖 Assistant
                </Badge>
              </div>
              <Card className="p-3 bg-card">
                <div className="flex items-center space-x-1">
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">Thinking...</span>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};