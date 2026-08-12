import type { ToolCallRecord } from "@/lib/agent";
import { describeToolCall, formatToolArguments } from "@/lib/describe-tool-call";
import { summarizeToolResult } from "@/lib/summarize-tool-result";

type ToolCallListProps = {
  calls: ToolCallRecord[];
};

export function ToolCallList({ calls }: ToolCallListProps) {
  if (calls.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 border-l border-surface pl-3">
      {calls.map((call, index) => {
        const result = summarizeToolResult(call.name, call.output);

        return (
          <li key={`${call.name}-${index}`}>
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                {describeToolCall(call)}
                <span className="ml-1.5 text-foreground/60">· {result.headline}</span>
              </summary>

              <div className="mt-1 flex flex-col gap-2 rounded bg-surface p-2 text-[12px] leading-relaxed text-muted">
                <pre className="overflow-x-auto">{formatToolArguments(call.input)}</pre>
                {result.items.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-background pt-2">
                    {result.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
