export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DayHours = { open: string; close: string } | null;

export type Hours = Record<DayKey, DayHours>;

export type RestaurantSummary = {
  slug: string;
  name: string;
  neighborhood: string;
  cuisine: string;
  priceTier: number;
  address: string;
  vegetarianFriendly: boolean;
  hours: Hours;
};

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
