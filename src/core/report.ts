import { getWeeklyCommits } from "./git";
import { getCurrentWeekRange, toDateKey, toDayLabel } from "./time";
import type { DateRange } from "./time";
import type { CommitEntry, DayGroup, Source, WeeklyReport } from "../types";

export async function buildWeeklyReport(
  sources: Source[],
  authorEmails: string[],
  now: Date = new Date(),
  range?: DateRange,
): Promise<WeeklyReport> {
  const resolvedRange = range ?? getCurrentWeekRange(now);
  const sinceIso = resolvedRange.start.toISOString();
  const untilIso = resolvedRange.end.toISOString();

  const allCommits = filterCommitsByAuthorEmail(
    await Promise.all(sources.map((source) => getWeeklyCommits(source.path, source.name, sinceIso, untilIso)))
      .then((results) => dedupeCommitsByHash(results.flat())),
    authorEmails,
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
    rangeStart: resolvedRange.start,
    generatedAt: now,
    days,
  };
}

export function filterCommitsByAuthorEmail<T extends { authorEmail: string }>(
  commits: T[],
  emails: string[],
): T[] {
  const normalised = emails.map((e) => e.trim().toLowerCase());
  return commits.filter((commit) => normalised.includes(commit.authorEmail.trim().toLowerCase()));
}

export function dedupeCommitsByHash(commits: CommitEntry[]): CommitEntry[] {
  const seen = new Set<string>();
  const unique: CommitEntry[] = [];

  for (const commit of commits) {
    if (seen.has(commit.hash)) {
      continue;
    }
    seen.add(commit.hash);
    unique.push(commit);
  }

  return unique;
}
