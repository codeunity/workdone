import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildSourceSelectionSession,
  formatSelectionEntryLabel,
  reconcileSourceSelection,
} from "../src/core/source-selection";
import type { ConfigFile, Source } from "../src/types";

const tempDirs: string[] = [];

function runGit(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workdone-source-selection-"));
  tempDirs.push(dir);
  return dir;
}

function createSource(repoPath: string, name = path.basename(repoPath)): Source {
  return { type: "git-local", path: repoPath, name };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("source selection session", () => {
  it("merges discovered and configured sources with checked state from config", async () => {
    const root = await createTempDir();
    const configuredRepo = path.join(root, "configured");
    const newRepo = path.join(root, "new-repo");
    await mkdir(configuredRepo, { recursive: true });
    await mkdir(newRepo, { recursive: true });
    runGit(["init"], configuredRepo);
    runGit(["init"], newRepo);

    const config: ConfigFile = {
      version: 1,
      sources: [createSource(configuredRepo)],
    };

    const session = await buildSourceSelectionSession(root, 2, config);

    expect(session.entries.map((entry) => entry.source.path)).toEqual([configuredRepo, newRepo]);
    expect(session.entries.map((entry) => entry.checked)).toEqual([true, false]);
    expect(session.entries.map((entry) => entry.status)).toEqual(["ok", "ok"]);
  });

  it("includes stale configured entries with validation status", async () => {
    const root = await createTempDir();
    const configuredRepo = path.join(root, "configured");
    const missingRepo = path.join(root, "missing-repo");
    await mkdir(configuredRepo, { recursive: true });
    runGit(["init"], configuredRepo);

    const config: ConfigFile = {
      version: 1,
      sources: [createSource(configuredRepo), createSource(missingRepo, "missing-repo")],
    };

    const session = await buildSourceSelectionSession(root, 2, config);
    const missingEntry = session.entries.find((entry) => entry.source.path === missingRepo);

    expect(missingEntry).not.toBeUndefined();
    expect(missingEntry?.configured).toBe(true);
    expect(missingEntry?.discovered).toBe(false);
    expect(missingEntry?.status).toBe("missing");
    expect(formatSelectionEntryLabel(missingEntry!)).toContain("[missing]");
  });

  it("reconciles scoped save without touching unrelated sources", async () => {
    const workspace = await createTempDir();
    const root = path.join(workspace, "selected-root");
    const outsideRoot = path.join(workspace, "outside-root");
    const keptRepo = path.join(root, "kept-repo");
    const newRepo = path.join(root, "new-repo");
    const removedRepo = path.join(root, "removed-repo");
    const outsideRepo = path.join(outsideRoot, "outside-repo");

    await mkdir(keptRepo, { recursive: true });
    await mkdir(newRepo, { recursive: true });
    await mkdir(removedRepo, { recursive: true });
    await mkdir(outsideRepo, { recursive: true });
    runGit(["init"], keptRepo);
    runGit(["init"], newRepo);
    runGit(["init"], removedRepo);
    runGit(["init"], outsideRepo);

    const config: ConfigFile = {
      version: 1,
      sources: [
        createSource(outsideRepo, "outside-repo"),
        createSource(keptRepo, "kept-repo"),
        createSource(removedRepo, "removed-repo"),
      ],
    };

    const session = await buildSourceSelectionSession(root, 2, config);
    const result = reconcileSourceSelection(config, session, [keptRepo, newRepo]);

    expect(result.addedCount).toBe(1);
    expect(result.removedCount).toBe(1);
    expect(result.keptCount).toBe(1);
    expect(result.config.sources.map((source) => source.path)).toEqual([outsideRepo, keptRepo, newRepo]);
  });
});
