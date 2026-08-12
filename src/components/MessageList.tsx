"use client";

import { useEffect, useRef } from "react";
import type { ToolCallRecord } from "@/lib/agent";
import { MessageBubble, type MessageRole } from "./MessageBubble";
import { ToolCallList } from "./ToolCallList";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallRecord[];
};

type MessageListProps = {
  messages: ChatMessage[];
  isThinking: boolean;
};

export function MessageList({ messages, isThinking }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isThinking]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 py-6">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-2">
            {message.toolCalls && <ToolCallList calls={message.toolCalls} />}
            <MessageBubble role={message.role} content={message.content} />
          </div>
        ))}
        {isThinking && (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div aria-live="polite" className="sr-only">
        {isThinking ? "Assistant is thinking" : ""}
      </div>
    </div>
  );
}
