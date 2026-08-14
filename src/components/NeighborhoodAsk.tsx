"use client";

type NeighborhoodAskProps = {
  neighborhoods: string[];
  onPick: (neighborhood: string) => void;
};

export function NeighborhoodAsk({ neighborhoods, onPick }: NeighborhoodAskProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <p className="text-sm text-foreground">
        I don&apos;t have that one. Which city? Give me city and state &mdash; like
        &ldquo;Austin, TX&rdquo;. Add a neighborhood first if you want somewhere
        specific. Here&apos;s what I already know:
      </p>
      <div className="flex flex-wrap gap-2">
        {neighborhoods.map((neighborhood) => (
          <button
            key={neighborhood}
            type="button"
            onClick={() => onPick(neighborhood)}
            className="rounded-full bg-background px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {neighborhood}
          </button>
        ))}
      </div>
    </div>
  );
}