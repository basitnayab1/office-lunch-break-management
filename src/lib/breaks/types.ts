import type { BreakType } from "@/types/database";

export const BREAK_TYPE_MINUTES: Record<BreakType, number> = {
  breakfast: 15,
  coffee: 15,
  lunch: 60,
};

export const BREAK_TYPE_OPTIONS: Array<{
  type: BreakType;
  label: string;
  minutes: number;
  description: string;
}> = [
  {
    type: "breakfast",
    label: "Breakfast",
    minutes: 15,
    description: "15 min",
  },
  {
    type: "coffee",
    label: "Coffee",
    minutes: 15,
    description: "15 min",
  },
  {
    type: "lunch",
    label: "Lunch",
    minutes: 60,
    description: "60 min",
  },
];

export function isBreakType(value: string): value is BreakType {
  return value === "breakfast" || value === "coffee" || value === "lunch";
}

/** Server-side mapping only — never trust client-sent durations. */
export function allowedMinutesForBreakType(type: BreakType): number {
  return BREAK_TYPE_MINUTES[type];
}

export function breakTypeLabel(type: BreakType | string | null | undefined): string {
  switch (type) {
    case "breakfast":
      return "Breakfast";
    case "coffee":
      return "Coffee";
    case "lunch":
      return "Lunch";
    default:
      return "—";
  }
}
