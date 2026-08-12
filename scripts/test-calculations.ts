import { calculateBreakMetrics, finalizeBreak } from "../src/lib/breaks/calculations";
import { allowedMinutesForBreakType } from "../src/lib/breaks/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(allowedMinutesForBreakType("breakfast") === 15, "breakfast minutes");
assert(allowedMinutesForBreakType("coffee") === 15, "coffee minutes");
assert(allowedMinutesForBreakType("lunch") === 60, "lunch minutes");

const start = "2026-08-10T08:00:00.000Z";
const endWithin = "2026-08-10T08:42:18.000Z";
const endOver = "2026-08-10T09:08:30.000Z";

const within = calculateBreakMetrics(start, 60, endWithin);
assert(!within.isOvertime, "should be within limit");
assert(within.actualSeconds === 42 * 60 + 18, `actual ${within.actualSeconds}`);
assert(
  within.remainingSeconds === 60 * 60 - (42 * 60 + 18),
  "remaining mismatch"
);

const over = calculateBreakMetrics(start, 60, endOver);
assert(over.isOvertime, "should be overtime");
assert(over.actualSeconds === 68 * 60 + 30, `actual seconds ${over.actualSeconds}`);
assert(over.extraSeconds === 8 * 60 + 30, `extra seconds ${over.extraSeconds}`);

const breakfastOver = calculateBreakMetrics(
  start,
  15,
  "2026-08-10T08:20:00.000Z"
);
assert(breakfastOver.isOvertime, "breakfast overtime");
assert(breakfastOver.extraSeconds === 5 * 60, "breakfast extra");

const finalized = finalizeBreak(start, endOver, 60);
assert(finalized.status === "exceeded", "status exceeded");
assert(finalized.extra_minutes === 8.5, `extra minutes ${finalized.extra_minutes}`);

console.log("calculation tests passed");
