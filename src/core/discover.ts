import { readdir } from "node:fs/promises";
import path from "node:path";
import { isGitRepoRoot } from "./git";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build"]);

export async function discoverGitRepos(rootFolder: string, maxDepth: number): Promise<string[]> {
  const repos = new Set<string>();

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    if (await isGitRepoRoot(currentPath)) {
      repos.add(currentPath);
      return;
    }

    if (depth === maxDepth) {
      return;
    }

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walk(path.join(currentPath, entry.name), depth + 1);
    }
  }

  await walk(rootFolder, 0);
  return [...repos].sort((a, b) => a.localeCompare(b));
}
