"use client";

/**
 * The wording is the contract, not decoration: isSpecificEnoughToCrawl accepts a
 * city with a state, or a neighborhood with a city, and refuses anything less.
 * This is the only place the user is told that, so a bare "Portland" is refused
 * for a reason they can see. Both accepted forms are shown as examples rather
 * than described, because the rule is easier to copy than to read.
 *
 * It says nothing about what is missing: the ask also fires on a turn that
 * called no tools at all, so after "hi" the old "I don't have that one" claimed
 * to be missing something the user had never asked for.
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
        Where should I look? A city and state does it &mdash; like &ldquo;Austin,
        TX&rdquo;. For a particular corner of town, put the neighborhood first:
        &ldquo;East Village, New York, NY&rdquo;.
      </p>
    </div>
  );
}