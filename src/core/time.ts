const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DateRange {
  start: Date;
  end: Date;
}

export function getCurrentWeekRange(now: Date = new Date()): DateRange {
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceMonday);
  return { start, end: now };
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
