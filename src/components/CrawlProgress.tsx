"use client";

type CrawlProgressProps = {
  neighborhood: string;
  status: string;
  completed: number;
  total: number;
};

export function CrawlProgress({ neighborhood, status, completed, total }: CrawlProgressProps) {
  const label =
    status === "failed"
      ? `Couldn't find anything for ${neighborhood}.`
      : `Looking up ${neighborhood}… ${completed}/${total || "?"}`;

  return (
    <div className="rounded-lg bg-surface px-4 py-3 text-sm text-muted" aria-live="polite">
      {label}
    </div>
  );
}