import { describe, expect, it } from "bun:test";
import { getCurrentWeekRange, toDateKey, toDayLabel, toTimeLabel } from "../src/core/time";

describe("time utilities", () => {
  it("calculates current week start as Monday", () => {
    const now = new Date("2026-03-18T15:30:00");
    const range = getCurrentWeekRange(now);
    expect(range.start.getDay()).toBe(1);
    expect(toDateKey(range.start)).toBe("2026-03-16");
  });

  it("keeps Monday as same-day start", () => {
    const now = new Date("2026-03-16T09:00:00");
    const range = getCurrentWeekRange(now);
    expect(toDateKey(range.start)).toBe("2026-03-16");
    expect(toTimeLabel(range.start)).toBe("00:00");
  });

  it("formats date and labels", () => {
    const date = new Date("2026-03-19T07:05:00");
    expect(toDateKey(date)).toBe("2026-03-19");
    expect(toDayLabel(date)).toBe("2026-03-19 (Thu)");
    expect(toTimeLabel(date)).toBe("07:05");
  });
});
