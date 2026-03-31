import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ALICE = "alice@example.com";
export const BOB = "bob@example.com";

export interface Fixtures {
  // Single author: 3 commits this week (Mon/Tue/Wed) by alice
  repoSingle: string;
  // Multi-author: commits by alice and bob this week
  repoMulti: string;
  // Empty: one old commit, nothing this week
  repoEmpty: string;
  // Date-range: commits spread across today, yesterday, this month, last month, last week
  repoDateRange: string;
  teardown: () => Promise<void>;
}

/** YYYY-MM-DD string for today + offsetDays */
export function dateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Returns an ISO timestamp string without milliseconds */
function toIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ISO timestamp for today at the given hour */
function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return toIso(d);
}

/** ISO timestamp for yesterday at the given hour */
function yesterdayAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return toIso(d);
}

/** ISO timestamp for the 1st of the month (monthOffset: 0 = this month, -1 = last month) */
function firstOfMonthAt(monthOffset: number, hour: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);
  d.setHours(hour, 0, 0, 0);
  return toIso(d);
}

/** ISO timestamp for Monday of the previous ISO week */
function lastWeekMondayAt(hour: number): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(now.getDate() + diffToMonday - 7);
  d.setHours(hour, 0, 0, 0);
  return toIso(d);
}

let fixtureDir: string | null = null;

function git(args: string[], cwd: string, env?: Record<string, string>): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${result.stderr}`);
  }
}

/** Returns the ISO string for Monday of the current ISO week at the given hour offset. */
function mondayOffset(dayOffset: number, hour: number): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday + dayOffset);
  monday.setHours(hour, 0, 0, 0);
  return toIso(monday);
}

async function createRepo(
  base: string,
  name: string,
  commits: Array<{ subject: string; author: string; file: string; content: string; ts: string }>,
): Promise<string> {
  const repoPath = path.join(base, name);
  await mkdir(repoPath, { recursive: true });

  git(["init"], repoPath);
  git(["config", "--local", "user.email", commits[0]?.author ?? ALICE], repoPath);
  git(["config", "--local", "user.name", "Test User"], repoPath);

  for (const commit of commits) {
    await writeFile(path.join(repoPath, commit.file), commit.content, "utf8");
    git(["add", commit.file], repoPath);
    git(
      ["commit", "-m", commit.subject],
      repoPath,
      {
        GIT_AUTHOR_DATE: commit.ts,
        GIT_COMMITTER_DATE: commit.ts,
        GIT_AUTHOR_EMAIL: commit.author,
        GIT_AUTHOR_NAME: "Test User",
        GIT_COMMITTER_EMAIL: commit.author,
        GIT_COMMITTER_NAME: "Test User",
      },
    );
  }

  return repoPath;
}

export async function setupFixtures(): Promise<Fixtures> {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), "workdone-e2e-fix-"));

  // repo-single: alice commits on Mon, Tue, Wed of this week
  const repoSingle = await createRepo(fixtureDir, "repo-single", [
    {
      subject: "add authentication middleware",
      author: ALICE,
      file: "auth.ts",
      content: "// auth middleware\nexport function authenticate() {}\n",
      ts: mondayOffset(0, 9),  // Monday 09:00
    },
    {
      subject: "add user profile endpoint",
      author: ALICE,
      file: "profile.ts",
      content: "// user profile\nexport function getProfile() {}\n",
      ts: mondayOffset(1, 11), // Tuesday 11:00
    },
    {
      subject: "fix token expiry validation",
      author: ALICE,
      file: "token.ts",
      content: "// token validation\nexport function validateToken() {}\n",
      ts: mondayOffset(2, 15), // Wednesday 15:00
    },
  ]);

  // repo-multi: alice and bob both commit this week
  const multiBase = path.join(fixtureDir, "repo-multi");
  await mkdir(multiBase, { recursive: true });
  git(["init"], multiBase);
  git(["config", "--local", "user.email", ALICE], multiBase);
  git(["config", "--local", "user.name", "Test User"], multiBase);

  // alice's commits
  await writeFile(path.join(multiBase, "api.ts"), "// api layer\nexport function fetchData() {}\n", "utf8");
  git(["add", "api.ts"], multiBase);
  git(["commit", "-m", "add data fetching layer"], multiBase, {
    GIT_AUTHOR_DATE: mondayOffset(0, 10),
    GIT_COMMITTER_DATE: mondayOffset(0, 10),
    GIT_AUTHOR_EMAIL: ALICE,
    GIT_AUTHOR_NAME: "Test User",
    GIT_COMMITTER_EMAIL: ALICE,
    GIT_COMMITTER_NAME: "Test User",
  });

  await writeFile(path.join(multiBase, "cache.ts"), "// cache layer\nexport function cacheResult() {}\n", "utf8");
  git(["add", "cache.ts"], multiBase);
  git(["commit", "-m", "add result caching"], multiBase, {
    GIT_AUTHOR_DATE: mondayOffset(1, 14),
    GIT_COMMITTER_DATE: mondayOffset(1, 14),
    GIT_AUTHOR_EMAIL: ALICE,
    GIT_AUTHOR_NAME: "Test User",
    GIT_COMMITTER_EMAIL: ALICE,
    GIT_COMMITTER_NAME: "Test User",
  });

  // bob's commits
  await writeFile(path.join(multiBase, "db.ts"), "// database layer\nexport function query() {}\n", "utf8");
  git(["add", "db.ts"], multiBase);
  git(["commit", "-m", "add database query builder"], multiBase, {
    GIT_AUTHOR_DATE: mondayOffset(0, 16),
    GIT_COMMITTER_DATE: mondayOffset(0, 16),
    GIT_AUTHOR_EMAIL: BOB,
    GIT_AUTHOR_NAME: "Bob",
    GIT_COMMITTER_EMAIL: BOB,
    GIT_COMMITTER_NAME: "Bob",
  });

  await writeFile(path.join(multiBase, "migrations.ts"), "// migrations\nexport function runMigrations() {}\n", "utf8");
  git(["add", "migrations.ts"], multiBase);
  git(["commit", "-m", "add migration runner"], multiBase, {
    GIT_AUTHOR_DATE: mondayOffset(2, 9),
    GIT_COMMITTER_DATE: mondayOffset(2, 9),
    GIT_AUTHOR_EMAIL: BOB,
    GIT_AUTHOR_NAME: "Bob",
    GIT_COMMITTER_EMAIL: BOB,
    GIT_COMMITTER_NAME: "Bob",
  });

  // repo-empty: one old commit from 30 days ago, nothing this week
  const repoEmpty = await createRepo(fixtureDir, "repo-empty", [
    {
      subject: "initial commit",
      author: ALICE,
      file: "readme.md",
      content: "# old repo\n",
      ts: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
  ]);

  // repo-daterange: commits spread across last month, this month start, last week, yesterday, today.
  // Commits are sorted by date ascending before creation so the git commit chain is strictly
  // chronological — required for git's --since/--until traversal pruning to work correctly.
  const repoDateRange = await createRepo(
    fixtureDir,
    "repo-daterange",
    [
      { subject: "feat: last month work",     author: ALICE, file: "last-month.ts",  content: "// last month\n",      ts: firstOfMonthAt(-1, 9) },
      { subject: "feat: start of month work", author: ALICE, file: "month-start.ts", content: "// start of month\n",  ts: firstOfMonthAt(0, 9)  },
      { subject: "feat: last week work",      author: ALICE, file: "last-week.ts",   content: "// last week\n",       ts: lastWeekMondayAt(11)  },
      { subject: "feat: yesterdays work",     author: ALICE, file: "yesterday.ts",   content: "// yesterday\n",      ts: yesterdayAt(14)       },
      { subject: "feat: todays work",         author: ALICE, file: "today.ts",       content: "// today\n",          ts: todayAt(1)            },
    ].sort((a, b) => a.ts.localeCompare(b.ts)),  // ISO strings sort lexicographically = chronologically
  );

  return {
    repoSingle,
    repoMulti: multiBase,
    repoEmpty,
    repoDateRange,
    teardown: async () => {
      if (fixtureDir) {
        await rm(fixtureDir, { recursive: true, force: true });
        fixtureDir = null;
      }
    },
  };
}
