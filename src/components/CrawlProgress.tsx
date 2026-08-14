"use client";

type CrawlProgressProps = {
  location: string;
  status: string;
  completed: number;
  total: number;
};

export function CrawlProgress({ location, status, completed, total }: CrawlProgressProps) {
  const label =
    status === "failed"
      ? `Couldn't find anything for ${location}.`
      : `Looking up ${location}… ${completed}/${total || "?"}`;

  return (
    <div className="rounded-lg bg-surface px-4 py-3 text-sm text-muted" aria-live="polite">
      {label}
    </div>
  );
}