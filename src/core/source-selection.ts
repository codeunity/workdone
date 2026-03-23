import path from "node:path";
import { discoverGitRepos } from "./discover";
import { normalizeInputPath } from "./paths";
import { validateSources } from "./validate";
import type { ConfigFile, InvalidReason, Source } from "../types";

export interface SourceSelectionEntry {
  source: Source;
  checked: boolean;
  configured: boolean;
  discovered: boolean;
  valid: boolean;
  reason?: InvalidReason;
  status: string;
}

export interface SourceSelectionSession {
  rootFolder: string;
  discoveredCount: number;
  relevantConfiguredCount: number;
  skippedCount: number;
  entries: SourceSelectionEntry[];
}

export interface ReconcileSelectionResult {
  config: ConfigFile;
  addedCount: number;
  removedCount: number;
  keptCount: number;
}

function normalizeAlias(name: string): string {
  return name.trim().toLowerCase();
}

function createStatus(valid: boolean, reason?: InvalidReason): string {
  if (valid) {
    return "ok";
  }

  switch (reason) {
    case "missing":
      return "missing";
    case "not_directory":
      return "not-dir";
    case "not_git_repo":
      return "not-git";
    case "not_accessible":
      return "blocked";
    default:
      return "invalid";
  }
}

export function isPathWithinRoot(rootFolder: string, candidatePath: string): boolean {
  const relative = path.relative(rootFolder, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function formatSelectionEntryLabel(entry: SourceSelectionEntry): string {
  return `${entry.source.name} [${entry.status}] ${entry.source.path}`;
}

export async function buildSourceSelectionSession(
  rootFolder: string,
  maxDepth: number,
  config: ConfigFile,
): Promise<SourceSelectionSession> {
  const discoveredRepos = await discoverGitRepos(rootFolder, maxDepth);
  const discoveredPaths = discoveredRepos.map((repoPath) => normalizeInputPath(repoPath));
  const relevantConfigured = config.sources.filter((source) => isPathWithinRoot(rootFolder, source.path));
  const entriesByPath = new Map<string, { source: Source; configured: boolean; discovered: boolean }>();
  const configuredAliases = new Set(config.sources.map((source) => normalizeAlias(source.name)));
  const batchAliases = new Set<string>();
  let skippedCount = 0;

  for (const source of relevantConfigured) {
    entriesByPath.set(source.path, {
      source,
      configured: true,
      discovered: false,
    });
  }

  for (const discoveredPath of discoveredPaths) {
    const configuredEntry = entriesByPath.get(discoveredPath);
    if (configuredEntry) {
      configuredEntry.discovered = true;
      continue;
    }

    const name = path.basename(discoveredPath);
    const aliasKey = normalizeAlias(name);
    if (configuredAliases.has(aliasKey) || batchAliases.has(aliasKey)) {
      skippedCount += 1;
      continue;
    }

    const source: Source = {
      type: "git-local",
      path: discoveredPath,
      name,
    };
    entriesByPath.set(discoveredPath, {
      source,
      configured: false,
      discovered: true,
    });
    batchAliases.add(aliasKey);
  }

  const baseEntries = [...entriesByPath.values()].sort((a, b) => a.source.path.localeCompare(b.source.path));
  const validations = await validateSources(baseEntries.map((entry) => entry.source));

  const entries = baseEntries.map((entry, index) => {
    const validation = validations[index];
    return {
      source: entry.source,
      checked: entry.configured,
      configured: entry.configured,
      discovered: entry.discovered,
      valid: validation.valid,
      reason: validation.reason,
      status: createStatus(validation.valid, validation.reason),
    };
  });

  return {
    rootFolder,
    discoveredCount: discoveredPaths.length,
    relevantConfiguredCount: relevantConfigured.length,
    skippedCount,
    entries,
  };
}

export function reconcileSourceSelection(
  config: ConfigFile,
  session: SourceSelectionSession,
  selectedPaths: string[],
): ReconcileSelectionResult {
  const selected = new Set(selectedPaths);
  const entryByPath = new Map(session.entries.map((entry) => [entry.source.path, entry] as const));
  const relevantPaths = new Set(session.entries.map((entry) => entry.source.path));

  const nextSources: Source[] = [];
  for (const source of config.sources) {
    if (!relevantPaths.has(source.path)) {
      nextSources.push(source);
      continue;
    }

    if (selected.has(source.path)) {
      nextSources.push(entryByPath.get(source.path)!.source);
    }
  }

  for (const entry of session.entries) {
    if (!entry.configured && selected.has(entry.source.path)) {
      nextSources.push(entry.source);
    }
  }

  const addedCount = session.entries.filter((entry) => !entry.configured && selected.has(entry.source.path)).length;
  const removedCount = session.entries.filter((entry) => entry.configured && !selected.has(entry.source.path)).length;
  const keptCount = session.entries.filter((entry) => entry.configured && selected.has(entry.source.path)).length;

  return {
    config: {
      version: config.version,
      sources: nextSources,
    },
    addedCount,
    removedCount,
    keptCount,
  };
}
