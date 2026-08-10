"use client";

import { useRef, useState } from "react";
import { Composer } from "./Composer";
import { MessageList, type ChatMessage } from "./MessageList";

const PROMPT_CHIPS = [
  "quiet spot for a first date",
  "best noodles under $15",
  "open past midnight downtown",
];

const FAKE_REPLIES = [
  "Here's a spot that fits: a dim, candlelit wine bar a few blocks over — small plates, quiet enough to talk, and they don't rush you out. Want the address?",
  "A few options come to mind. Give me a neighborhood or a cuisine you're leaning toward and I'll narrow it down.",
  "Good call — that's the kind of place that's better with a reservation. Want me to check what's open tonight?",
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend(text: string) {
    if (isThinking) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setDraft("");
    setIsThinking(true);

    const delay = 700 + Math.random() * 500;
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: randomFrom(FAKE_REPLIES) },
      ]);
      setIsThinking(false);
    }, delay);
  }

  function handleChipClick(prompt: string) {
    setDraft(prompt);
    textareaRef.current?.focus();
  }

  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <h1 className="text-2xl font-medium text-foreground">
              What are you in the mood for?
            </h1>
            <div className="flex flex-wrap justify-center gap-2">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="rounded-full bg-surface px-4 py-2 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} isThinking={isThinking} />
        )}
        <Composer
          ref={textareaRef}
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          disabled={isThinking}
        />
      </div>
    </main>
  );
}
