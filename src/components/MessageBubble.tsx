export type MessageRole = "user" | "assistant";

type MessageBubbleProps = {
  role: MessageRole;
  content: string;
};

export function MessageBubble({ role, content }: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
      {content}
    </div>
  );
}
