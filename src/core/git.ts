import { spawn } from "node:child_process";
import type { CommitEntry, FileChange } from "../types";

const COMMIT_PREFIX = "__WORKDONE_COMMIT__|";

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runGit(args: string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function gitErrorMessage(stderr: string): string {
  const trimmed = stderr.trim();
  return trimmed === "" ? "git command failed" : trimmed;
}

export async function isGitRepo(repoPath: string): Promise<boolean> {
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], repoPath).catch(() => {
    return { stdout: "", stderr: "", code: 1 };
  });
  return result.code === 0 && result.stdout.trim() === "true";
}

export async function getGitTopLevel(dirPath: string): Promise<string | null> {
  const result = await runGit(["rev-parse", "--show-toplevel"], dirPath).catch(() => {
    return { stdout: "", stderr: "", code: 1 };
  });
  if (result.code !== 0) {
    return null;
  }
  const topLevel = result.stdout.trim();
  return topLevel === "" ? null : topLevel;
}

export async function isGitRepoRoot(dirPath: string): Promise<boolean> {
  const result = await runGit(["rev-parse", "--show-prefix"], dirPath).catch(() => {
    return { stdout: "", stderr: "", code: 1 };
  });
  if (result.code !== 0) {
    return false;
  }
  return result.stdout.trim() === "";
}

export async function getGlobalGitUserEmail(): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const result = await runGit(["config", "--global", "user.email"], homeDir).catch(() => {
    return { stdout: "", stderr: "", code: 1 };
  });
  if (result.code !== 0) {
    throw new Error('git global user.email is not set\nTry: git config --global user.email "you@example.com"');
  }
  const email = result.stdout.trim();
  if (email === "") {
    throw new Error('git global user.email is not set\nTry: git config --global user.email "you@example.com"');
  }
  return email;
}

export async function syncGitSource(repoPath: string): Promise<void> {
  const result = await runGit(["fetch", "--all", "--prune"], repoPath).catch(() => {
    return { stdout: "", stderr: "", code: 1 };
  });
  if (result.code !== 0) {
    throw new Error(gitErrorMessage(result.stderr));
  }
}

function parseNumstat(line: string): FileChange | null {
  const parts = line.split("\t");
  if (parts.length < 3) {
    return null;
  }
  const [addRaw, delRaw, filePath] = parts;
  if (!filePath) {
    return null;
  }

  const binary = addRaw === "-" || delRaw === "-";
  const added = binary ? 0 : Number.parseInt(addRaw, 10);
  const deleted = binary ? 0 : Number.parseInt(delRaw, 10);
  if (Number.isNaN(added) || Number.isNaN(deleted)) {
    return null;
  }

  return {
    path: filePath,
    added,
    deleted,
    changedLines: added + deleted,
    binary,
  };
}

export async function getWeeklyCommits(
  repoPath: string,
  repoName: string,
  sinceIso: string,
  untilIso: string,
): Promise<CommitEntry[]> {
  const format = `${COMMIT_PREFIX}%H|%aI|%ae|%s`;
  const args = [
    "log",
    "--branches",
    "--remotes",
    `--since=${sinceIso}`,
    `--until=${untilIso}`,
    `--pretty=format:${format}`,
    "--numstat",
  ];

  const result = await runGit(args, repoPath);
  if (result.code !== 0) {
    throw new Error(`Failed to read git log for ${repoPath}: ${gitErrorMessage(result.stderr)}`);
  }

  const lines = result.stdout.split(/\r?\n/);
  const commits: CommitEntry[] = [];
  let current: CommitEntry | null = null;

  for (const line of lines) {
    if (line.startsWith(COMMIT_PREFIX)) {
      if (current !== null) {
        commits.push(current);
      }
      const payload = line.slice(COMMIT_PREFIX.length);
      const first = payload.indexOf("|");
      const second = payload.indexOf("|", first + 1);
      const third = payload.indexOf("|", second + 1);
      if (first === -1 || second === -1 || third === -1) {
        continue;
      }
      const hash = payload.slice(0, first);
      const dateIso = payload.slice(first + 1, second);
      const authorEmail = payload.slice(second + 1, third);
      const subject = payload.slice(third + 1);
      current = {
        repoPath,
        repoName,
        hash,
        authorEmail,
        date: new Date(dateIso),
        subject,
        files: [],
      };
      continue;
    }

    if (!current || line.trim() === "") {
      continue;
    }

    const parsed = parseNumstat(line);
    if (parsed) {
      current.files.push(parsed);
    }
  }

  if (current !== null) {
    commits.push(current);
  }

  return commits;
}
