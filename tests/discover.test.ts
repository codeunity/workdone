import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { discoverGitRepos } from "../src/core/discover";

const tempDirs: string[] = [];

function runGit(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workdone-discover-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("discover git repos", () => {
  it("returns only the repo root and skips nested folders", async () => {
    const root = await createTempDir();
    const repoRoot = path.join(root, "my-repo");
    await mkdir(path.join(repoRoot, ".github"), { recursive: true });
    await mkdir(path.join(repoRoot, ".vscode"), { recursive: true });
    await mkdir(path.join(repoRoot, "docker"), { recursive: true });
    runGit(["init"], repoRoot);

    const repos = await discoverGitRepos(root, 4);

    expect(repos).toHaveLength(1);
    expect(repos[0]).toBe(repoRoot);
  });

  it("does not add parent repo when scanning subfolder inside repo", async () => {
    const root = await createTempDir();
    const repoRoot = path.join(root, "my-repo");
    const subfolder = path.join(repoRoot, ".github");
    await mkdir(subfolder, { recursive: true });
    runGit(["init"], repoRoot);

    const repos = await discoverGitRepos(subfolder, 4);

    expect(repos).toHaveLength(0);
  });
});
