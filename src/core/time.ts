const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DateRange {
  start: Date;
  end: Date;
}

export type WeekOption =
  | { kind: "relative"; offset: number }
  | { kind: "absolute"; year: number; week: number };

export function getCurrentWeekRange(now: Date = new Date()): DateRange {
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceMonday);
  return { start, end: now };
}

/**
 * Parses a --week flag value into a structured WeekOption.
 * Accepts:
 *   Relative: "-1", "-2" (negative integers, offset from current ISO week)
 *   Absolute: "5" (positive integer, ISO week of current year), "2026-5" (year + ISO week)
 */
export function parseWeekOption(value: string): WeekOption {
  // Relative: a negative integer
  if (/^-\d+$/.test(value)) {
    const offset = parseInt(value, 10);
    if (offset < -53 * 10) {
      throw new Error(`Invalid --week value "${value}": relative offset is out of reasonable range.`);
    }
    if (offset === 0) {
      throw new Error(`Invalid --week value "0": use no flag to get the current week.`);
    }
    return { kind: "relative", offset };
  }

  // Absolute with year: "2026-5"
  const withYear = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (withYear) {
    const year = parseInt(withYear[1], 10);
    const week = parseInt(withYear[2], 10);
    validateIsoWeek(week, year);
    return { kind: "absolute", year, week };
  }

  // Absolute without year: "5"
  if (/^\d{1,2}$/.test(value)) {
    const week = parseInt(value, 10);
    // Year is resolved later at resolve-time; validate range loosely now (1-53)
    if (week < 1 || week > 53) {
      throw new Error(`Invalid --week value "${value}": week number must be between 1 and 53.`);
    }
    return { kind: "absolute", year: 0, week }; // year=0 means "use current year"
  }

  throw new Error(
    `Invalid --week value "${value}". Use a negative offset like -1 (last week), a week number like 5 (ISO week 5 of current year), or a year+week like 2026-5.`,
  );
}

/**
 * Returns the number of ISO weeks in a given year (52 or 53).
 * A year has 53 ISO weeks if Jan 1 is Thursday, or Dec 31 is Thursday.
 */
export function isoWeeksInYear(year: number): number {
  const jan1Day = new Date(year, 0, 1).getDay(); // 0=Sun..6=Sat
  const dec31Day = new Date(year, 11, 31).getDay();
  return jan1Day === 4 || dec31Day === 4 ? 53 : 52;
}

function validateIsoWeek(week: number, year: number): void {
  if (week < 1) {
    throw new Error(`Invalid --week value: week number must be at least 1.`);
  }
  const maxWeek = isoWeeksInYear(year);
  if (week > maxWeek) {
    throw new Error(`Week ${week} does not exist in year ${year} (that year only has ${maxWeek} ISO weeks).`);
  }
}

/**
 * Returns the Monday of ISO week 1 for the given year.
 * ISO week 1 is the week containing the first Thursday of the year.
 */
function isoWeek1Monday(year: number): Date {
  // Find Jan 4, which is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (jan4Day + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Returns the ISO week number (1–53) and ISO year for a given date.
 * The ISO year may differ from the calendar year near Jan 1 and Dec 31.
 */
export function toIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  // Find Thursday of the date's week (ISO weeks are anchored on Thursday)
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - daysSinceMonday + 3);
  const isoYear = thursday.getFullYear();
  const week1Mon = isoWeek1Monday(isoYear);
  const weekNum = Math.round((thursday.getTime() - week1Mon.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { isoYear, isoWeek: weekNum };
}

/**
 * Converts a WeekOption into a concrete DateRange (Monday 00:00:00 – Sunday 23:59:59 local time).
 */
export function resolveWeekRange(option: WeekOption, now: Date = new Date()): DateRange {
  let targetYear: number;
  let targetWeek: number;

  if (option.kind === "relative") {
    const { isoYear, isoWeek } = toIsoWeek(now);
    // Compute target week by subtracting the offset (offset is negative, e.g. -1)
    let week = isoWeek + option.offset;
    let year = isoYear;
    // Carry across year boundaries
    while (week < 1) {
      year -= 1;
      week += isoWeeksInYear(year);
    }
    while (week > isoWeeksInYear(year)) {
      week -= isoWeeksInYear(year);
      year += 1;
    }
    targetYear = year;
    targetWeek = week;
  } else {
    targetYear = option.year === 0 ? now.getFullYear() : option.year;
    targetWeek = option.week;
    // Validate week number against the resolved year (handles week 53 check)
    validateIsoWeek(targetWeek, targetYear);
  }

  const week1Mon = isoWeek1Monday(targetYear);
  const start = new Date(week1Mon);
  start.setDate(start.getDate() + (targetWeek - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Parses a YYYY-MM-DD date string strictly. Throws on wrong format or impossible dates.
 */
export function parseDateOption(value: string, flag: string = "--since"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Invalid value for '${flag}': "${value}". Expected format: YYYY-MM-DD (e.g., 2026-03-20).`,
    );
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Detect impossible dates (e.g. Feb 30) by checking if the components round-trip
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`Invalid date for '${flag}': "${value}" is not a real calendar date.`);
  }
  return date;
}

/**
 * Builds a DateRange from --since and optional --until strings.
 * - since sets 00:00:00 local time on that date
 * - until sets 23:59:59.999 local time on that date
 * - omitting until defaults to now
 */
export function resolveDateRange(since: string, until?: string, now: Date = new Date()): DateRange {
  const sinceDate = parseDateOption(since, "--since");
  sinceDate.setHours(0, 0, 0, 0);

  let untilDate: Date;
  if (until !== undefined) {
    untilDate = parseDateOption(until, "--until");
    untilDate.setHours(23, 59, 59, 999);
  } else {
    untilDate = now;
  }

  return { start: sinceDate, end: untilDate };
}

export type Shortcut = "today" | "yesterday" | "last-week" | "this-month" | "last-month";

/**
 * Returns a DateRange for a named shortcut relative to now.
 * - today:      00:00:00 today → now
 * - yesterday:  00:00:00 yesterday → 23:59:59 yesterday
 * - this-month: 00:00:00 on the 1st of this month → now
 * - last-month: 00:00:00 on the 1st of last month → 23:59:59 on the last day of last month
 */
export function resolveShortcutRange(shortcut: Shortcut, now: Date = new Date()): DateRange {
  switch (shortcut) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    case "yesterday": {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "this-month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end: now };
    }
    case "last-week":
      return resolveWeekRange({ kind: "relative", offset: -1 }, now);
    case "last-month": {
      const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      // Last day of last month = day 0 of current month
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDayLabel(date: Date): string {
  return `${toDateKey(date)} (${WEEKDAY[date.getDay()]})`;
}

export function toTimeLabel(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
