import { getWeeklyCommits } from "./git";
import { getCurrentWeekRange, toDateKey, toDayLabel } from "./time";
import type { DayGroup, Source, WeeklyReport } from "../types";

export async function buildWeeklyReport(
  sources: Source[],
  authorEmail: string,
  now: Date = new Date(),
): Promise<WeeklyReport> {
  const range = getCurrentWeekRange(now);
  const sinceIso = range.start.toISOString();
  const untilIso = range.end.toISOString();

  const allCommits = filterCommitsByAuthorEmail(
    await Promise.all(sources.map((source) => getWeeklyCommits(source.path, source.name, sinceIso, untilIso)))
      .then((results) => results.flat()),
    authorEmail,
  );

  allCommits.sort((a, b) => b.date.getTime() - a.date.getTime());

  const dayMap = new Map<string, DayGroup>();
  for (const commit of allCommits) {
    const key = toDateKey(commit.date);
    const existing = dayMap.get(key);
    if (existing) {
      existing.commits.push(commit);
    } else {
      dayMap.set(key, {
        dateKey: key,
        label: toDayLabel(commit.date),
        commits: [commit],
      });
    }
  }

  const days = [...dayMap.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  for (const day of days) {
    day.commits.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  return {
    weekStart: range.start,
    generatedAt: now,
    days,
  };
}

export function filterCommitsByAuthorEmail<T extends { authorEmail: string }>(
  commits: T[],
  email: string,
): T[] {
  const expected = email.trim().toLowerCase();
  return commits.filter((commit) => commit.authorEmail.trim().toLowerCase() === expected);
}
