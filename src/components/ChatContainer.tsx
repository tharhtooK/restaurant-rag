"use client";

import { useEffect, useRef, useState } from "react";
import { Composer } from "./Composer";
import { MessageList, type ChatMessage } from "./MessageList";
import { NeighborhoodAsk } from "./NeighborhoodAsk";
import { CrawlProgress } from "./CrawlProgress";

const PROMPT_CHIPS = [
  "quiet spot for a first date",
  "best noodles under $15",
  "open past midnight downtown",
];

type PendingCrawl = {
  jobId: string;
  neighborhood: string;
  question: string;
  status: string;
  completed: number;
  total: number;
};

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pendingCrawl, setPendingCrawl] = useState<PendingCrawl | null>(null);

  const [needsNeighborhood, setNeedsNeighborhood] = useState(false);
  const [knownNeighborhoods, setKnownNeighborhoods] = useState<string[]>([]);
  // The question that triggered the ask, so it can be re-offered once a crawl lands.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/neighborhoods")
      .then((response) => response.json())
      .then((data) => setKnownNeighborhoods(data.neighborhoods ?? []))
      .catch(() => setKnownNeighborhoods([]));
  }, []);

  useEffect(() => {
    if (!pendingCrawl || pendingCrawl.status === "succeeded" || pendingCrawl.status === "failed") {
      return;
    }

    const jobId = pendingCrawl.jobId;
    let cancelled = false;

    const timer = setInterval(async () => {
      let job;
      try {
        const response = await fetch(`/api/crawl/${jobId}`);
        job = await response.json();
      } catch {
        return;
      }
      if (cancelled) return;

      setPendingCrawl((current) => {
        if (!current || current.jobId !== jobId) return current;
        return {
          ...current,
          status: job.status ?? current.status,
          completed: job.progress?.completed ?? current.completed,
          total: job.progress?.total ?? current.total,
        };
      });

      // Waits for imported, not just succeeded: the job can succeed at the
      // crawler while the import into Postgres fails, and announcing the
      // neighborhood is ready then would be a lie.
      if (job.status === "succeeded" && job.imported) {
        // Cleared here, not just by the effect re-running, so a poll already in
        // flight cannot append the completion message a second time.
        clearInterval(timer);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `I've got ${pendingCrawl.neighborhood} now — want me to look at "${pendingCrawl.question}" again?`,
          },
        ]);
        setDraft(pendingCrawl.question);
        setPendingQuestion(null);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingCrawl]);

  async function handleSend(text: string) {
    if (isThinking) return;

    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setDraft("");
    setIsThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The ask being on screen is what makes this message an answer to it,
        // and an answer is the only thing allowed to start a crawl.
        body: JSON.stringify({ message: text, history, answeringNeighborhood: needsNeighborhood }),
      });

      const data = await response.json();
      const content = response.ok && data.text ? data.text : "Sorry, I hit an error answering that. Try again?";
      const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : undefined;
      if (data.needsNeighborhood) {
        setNeedsNeighborhood(true);
        setPendingQuestion(text);
      } else {
        setNeedsNeighborhood(false);
      }
      if (data.crawl) {
        setNeedsNeighborhood(false);
        setPendingCrawl({
          jobId: data.crawl.jobId,
          neighborhood: data.crawl.neighborhood,
          question: pendingQuestion ?? text,
          status: "queued",
          completed: 0,
          total: 0,
        });
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content, toolCalls },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Try again?",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
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
        {pendingCrawl && pendingCrawl.status !== "succeeded" && (
          <CrawlProgress
            neighborhood={pendingCrawl.neighborhood}
            status={pendingCrawl.status}
            completed={pendingCrawl.completed}
            total={pendingCrawl.total}
          />
        )}
        {needsNeighborhood && (
          <NeighborhoodAsk
            neighborhoods={knownNeighborhoods}
            onPick={handleChipClick}
          />
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
