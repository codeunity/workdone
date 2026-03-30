import { describe, expect, it } from "bun:test";
import {
  getCurrentWeekRange,
  isoWeeksInYear,
  parseDateOption,
  parseWeekOption,
  resolveDateRange,
  resolveWeekRange,
  toDateKey,
  toDayLabel,
  toIsoWeek,
  toTimeLabel,
} from "../src/core/time";

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

describe("isoWeeksInYear", () => {
  it("returns 52 for a common year", () => {
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2023)).toBe(52);
  });

  it("returns 53 for long years", () => {
    // 2015: Jan 1 is Thursday → 53 weeks
    expect(isoWeeksInYear(2015)).toBe(53);
    // 2020: Dec 31 is Thursday → 53 weeks
    expect(isoWeeksInYear(2020)).toBe(53);
    // 2026: Jan 1 is Thursday → 53 weeks
    expect(isoWeeksInYear(2026)).toBe(53);
  });
});

describe("toIsoWeek", () => {
  it("returns correct ISO week for a mid-year date", () => {
    // 2026-03-18 is in ISO week 12 of 2026
    const { isoYear, isoWeek } = toIsoWeek(new Date("2026-03-18T10:00:00"));
    expect(isoYear).toBe(2026);
    expect(isoWeek).toBe(12);
  });

  it("handles year boundary: early Jan in last year's week 53", () => {
    // 2016-01-03 belongs to ISO week 53 of 2015
    const { isoYear, isoWeek } = toIsoWeek(new Date("2016-01-03T12:00:00"));
    expect(isoYear).toBe(2015);
    expect(isoWeek).toBe(53);
  });

  it("handles year boundary: late Dec in next year's week 1", () => {
    // 2019-12-30 belongs to ISO week 1 of 2020
    const { isoYear, isoWeek } = toIsoWeek(new Date("2019-12-30T12:00:00"));
    expect(isoYear).toBe(2020);
    expect(isoWeek).toBe(1);
  });
});

describe("parseWeekOption", () => {
  it("parses relative negative offsets", () => {
    expect(parseWeekOption("-1")).toEqual({ kind: "relative", offset: -1 });
    expect(parseWeekOption("-2")).toEqual({ kind: "relative", offset: -2 });
    expect(parseWeekOption("-52")).toEqual({ kind: "relative", offset: -52 });
  });

  it("parses absolute week number (current year)", () => {
    expect(parseWeekOption("1")).toEqual({ kind: "absolute", year: 0, week: 1 });
    expect(parseWeekOption("5")).toEqual({ kind: "absolute", year: 0, week: 5 });
    expect(parseWeekOption("53")).toEqual({ kind: "absolute", year: 0, week: 53 });
  });

  it("parses absolute week with year", () => {
    expect(parseWeekOption("2026-5")).toEqual({ kind: "absolute", year: 2026, week: 5 });
    expect(parseWeekOption("2015-53")).toEqual({ kind: "absolute", year: 2015, week: 53 });
  });

  it("throws on zero (reserved for current week)", () => {
    expect(() => parseWeekOption("0")).toThrow();
  });

  it("throws on week number out of range", () => {
    expect(() => parseWeekOption("54")).toThrow();
    expect(() => parseWeekOption("0")).toThrow();
  });

  it("throws on week 53 in year that only has 52 weeks", () => {
    // 2025 has 52 ISO weeks (Jan 1 = Wednesday)
    expect(() => parseWeekOption("2025-53")).toThrow(/53.*2025|2025.*53/i);
  });

  it("throws on non-numeric input", () => {
    expect(() => parseWeekOption("abc")).toThrow();
    expect(() => parseWeekOption("last-week")).toThrow();
    expect(() => parseWeekOption("")).toThrow();
  });
});

describe("resolveWeekRange", () => {
  // 2026-03-18 (Wed) is ISO week 12 of 2026
  const now = new Date("2026-03-18T15:30:00");

  it("resolves relative -1 to the previous ISO week (Mon–Sun)", () => {
    const range = resolveWeekRange({ kind: "relative", offset: -1 }, now);
    // Week 11 of 2026: Mon 2026-03-09 – Sun 2026-03-15
    expect(toDateKey(range.start)).toBe("2026-03-09");
    expect(range.start.getDay()).toBe(1); // Monday
    expect(toDateKey(range.end)).toBe("2026-03-15");
    expect(range.end.getDay()).toBe(0); // Sunday
    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMinutes()).toBe(59);
    expect(range.end.getSeconds()).toBe(59);
  });

  it("resolves relative -2 to two weeks ago", () => {
    const range = resolveWeekRange({ kind: "relative", offset: -2 }, now);
    // Week 10 of 2026: Mon 2026-03-02 – Sun 2026-03-08
    expect(toDateKey(range.start)).toBe("2026-03-02");
    expect(toDateKey(range.end)).toBe("2026-03-08");
  });

  it("resolves absolute week 5 of current year", () => {
    const range = resolveWeekRange({ kind: "absolute", year: 0, week: 5 }, now);
    // ISO week 5 of 2026: Mon 2026-01-26 – Sun 2026-02-01
    expect(toDateKey(range.start)).toBe("2026-01-26");
    expect(toDateKey(range.end)).toBe("2026-02-01");
  });

  it("resolves absolute week with explicit year", () => {
    const range = resolveWeekRange({ kind: "absolute", year: 2026, week: 1 }, now);
    // ISO week 1 of 2026: Mon 2025-12-29 – Sun 2026-01-04
    expect(toDateKey(range.start)).toBe("2025-12-29");
    expect(toDateKey(range.end)).toBe("2026-01-04");
  });

  it("carries correctly across year boundary for relative offset", () => {
    // 2026-01-07 (Wed) is ISO week 2 of 2026; offset -2 → week 52 of 2025
    const early = new Date("2026-01-07T10:00:00");
    const range = resolveWeekRange({ kind: "relative", offset: -2 }, early);
    // Week 52 of 2025: Mon 2025-12-22 – Sun 2025-12-28
    expect(toDateKey(range.start)).toBe("2025-12-22");
    expect(toDateKey(range.end)).toBe("2025-12-28");
  });

  it("throws for week 53 in a year with only 52 weeks", () => {
    // 2025 has only 52 ISO weeks
    expect(() =>
      resolveWeekRange({ kind: "absolute", year: 2025, week: 53 }, now)
    ).toThrow(/53.*2025|2025.*53/i);
  });
})

describe("parseDateOption", () => {
  it("parses a valid YYYY-MM-DD date", () => {
    const d = parseDateOption("2026-03-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(d.getDate()).toBe(20);
  });

  it("throws on wrong format (wrong separator)", () => {
    expect(() => parseDateOption("20-3-2026")).toThrow(/YYYY-MM-DD/i);
  });

  it("throws on wrong format (missing leading zeros)", () => {
    expect(() => parseDateOption("2026-3-2")).toThrow(/YYYY-MM-DD/i);
  });

  it("throws on an impossible date (Feb 30)", () => {
    expect(() => parseDateOption("2026-02-30")).toThrow();
  });

  it("throws on an impossible date (month 13)", () => {
    expect(() => parseDateOption("2026-13-01")).toThrow();
  });

  it("includes the flag name in the error message", () => {
    expect(() => parseDateOption("bad", "--until")).toThrow(/--until/);
  });
});

describe("resolveDateRange", () => {
  const now = new Date("2026-03-30T11:00:00");

  it("since alone sets start to 00:00:00 and end to now", () => {
    const range = resolveDateRange("2026-03-20", undefined, now);
    expect(toDateKey(range.start)).toBe("2026-03-20");
    expect(range.start.getHours()).toBe(0);
    expect(range.start.getMinutes()).toBe(0);
    expect(range.start.getSeconds()).toBe(0);
    expect(range.end).toBe(now);
  });

  it("since + until sets start to 00:00:00 and end to 23:59:59", () => {
    const range = resolveDateRange("2026-03-20", "2026-03-30", now);
    expect(toDateKey(range.start)).toBe("2026-03-20");
    expect(range.start.getHours()).toBe(0);
    expect(toDateKey(range.end)).toBe("2026-03-30");
    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMinutes()).toBe(59);
    expect(range.end.getSeconds()).toBe(59);
  });

  it("throws on invalid since date", () => {
    expect(() => resolveDateRange("20-3-2026", undefined, now)).toThrow();
  });

  it("throws on invalid until date", () => {
    expect(() => resolveDateRange("2026-03-20", "30-3-2026", now)).toThrow();
  });
});
