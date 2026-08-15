"use client";

/**
 * The wording is the contract, not decoration: isSpecificEnoughToCrawl accepts a
 * city with a state, or a neighborhood with a city, and refuses anything less.
 * This is the only place the user is told that, so a bare "Portland" is refused
 * for a reason they can see.
 *
 * It used to list every neighborhood on file underneath, as chips. The list had
 * no cities in it - "South Congress" is Austin and "Red Hook" is Brooklyn, shown
 * side by side - so it read as noise to anyone outside New York and as a wrong
 * answer to anyone inside it.
 */
export function NeighborhoodAsk() {
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="text-sm text-foreground">
        I don&apos;t have that one. Which city? Give me city and state &mdash; like
        &ldquo;Austin, TX&rdquo;. Add a neighborhood first if you want somewhere
        specific.
      </p>
    </div>
  );
}