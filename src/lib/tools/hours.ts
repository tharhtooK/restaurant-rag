import type { Hours } from "./types";

export type HoursConstraints = {
  openPast?: string;
  opensBy?: string;
};

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Minutes-since-midnight comparisons treat a closing time past midnight ("00:30")
// as 30, i.e. earlier than any evening threshold, so such a day never satisfies
// openPast. The seed data avoids past-midnight closes for exactly this reason —
// see the G02 distractor note in CLAUDE.md.
function closesAfter(hours: Hours, threshold: string): boolean {
  const thresholdMinutes = timeToMinutes(threshold);
  return Object.values(hours).some(
    (day) => day !== null && timeToMinutes(day.close) > thresholdMinutes,
  );
}

function opensAtOrBefore(hours: Hours, threshold: string): boolean {
  const thresholdMinutes = timeToMinutes(threshold);
  return Object.values(hours).some(
    (day) => day !== null && timeToMinutes(day.open) <= thresholdMinutes,
  );
}

export function matchesHours(hours: Hours, constraints: HoursConstraints): boolean {
  if (constraints.openPast && !closesAfter(hours, constraints.openPast)) return false;
  if (constraints.opensBy && !opensAtOrBefore(hours, constraints.opensBy)) return false;
  return true;
}
