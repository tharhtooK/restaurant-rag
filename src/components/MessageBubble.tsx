import Markdown from "react-markdown";

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
    <div className="text-[15px] leading-relaxed text-foreground [&_a]:underline [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown>{content}</Markdown>
    </div>
  );
}
