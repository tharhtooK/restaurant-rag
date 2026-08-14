import type { ToolCallRecord } from "@/lib/agent";
import { describeToolCall, formatToolArguments } from "@/lib/describe-tool-call";
import { summarizeToolResult } from "@/lib/summarize-tool-result";

const SUMMARY_CLASSES =
  "cursor-pointer list-none transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type ResultDetailProps = {
  headline: string;
  items: string[];
};

function ResultDetail({ headline, items }: ResultDetailProps) {
  if (items.length === 0) {
    return <p className="border-t border-background pt-2 text-foreground/60">{headline}</p>;
  }

  return (
    <details className="group/result border-t border-background pt-2">
      <summary className={`${SUMMARY_CLASSES} text-foreground/60`}>
        <span className="mr-1 inline-block transition-transform group-open/result:rotate-90">›</span>
        {headline}
      </summary>
      <ul className="mt-1 flex flex-col gap-1 border-l border-background pl-3">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

type ToolCallRowProps = {
  call: ToolCallRecord;
};

function ToolCallRow({ call }: ToolCallRowProps) {
  const result = summarizeToolResult(call.name, call.output);

  return (
    <details className="group/call">
      <summary className={`${SUMMARY_CLASSES} text-[13px] text-muted`}>
        <span className="mr-1 inline-block transition-transform group-open/call:rotate-90">›</span>
        {describeToolCall(call)}
        <span className="ml-1.5 text-foreground/60">· {result.headline}</span>
      </summary>

      <div className="mt-1 flex flex-col gap-2 rounded bg-surface p-2 text-[12px] leading-relaxed text-muted">
        <pre className="no-scrollbar overflow-x-auto">{formatToolArguments(call.input)}</pre>
        <ResultDetail headline={result.headline} items={result.items} />
      </div>
    </details>
  );
}

type ToolCallListProps = {
  calls: ToolCallRecord[];
};

export function ToolCallList({ calls }: ToolCallListProps) {
  if (calls.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 border-l border-surface pl-3">
      {calls.map((call, index) => (
        <li key={`${call.name}-${index}`}>
          <ToolCallRow call={call} />
        </li>
      ))}
    </ul>
  );
}
