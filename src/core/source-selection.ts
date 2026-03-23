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
  defaultName: string;
  aliasResolved: boolean;
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

function nextNumericAlias(stem: string, usedAliases: Set<string>): string {
  for (let index = 1; ; index += 1) {
    const candidate = `${stem}-${index}`;
    if (!usedAliases.has(normalizeAlias(candidate))) {
      return candidate;
    }
  }
}

function nearestParentAliasPrefix(rootFolder: string, repoPath: string): string | null {
  const parentPath = path.dirname(repoPath);
  if (!isPathWithinRoot(rootFolder, parentPath) || parentPath === rootFolder) {
    return null;
  }
  return path.basename(parentPath);
}

export function resolveNewSourceAlias(
  rootFolder: string,
  repoPath: string,
  usedAliases: Set<string>,
): { name: string; defaultName: string; aliasResolved: boolean } {
  const defaultName = path.basename(repoPath);
  const defaultKey = normalizeAlias(defaultName);
  if (!usedAliases.has(defaultKey)) {
    return { name: defaultName, defaultName, aliasResolved: false };
  }

  const parentPrefix = nearestParentAliasPrefix(rootFolder, repoPath);
  if (parentPrefix) {
    const prefixed = `${parentPrefix}-${defaultName}`;
    if (!usedAliases.has(normalizeAlias(prefixed))) {
      return { name: prefixed, defaultName, aliasResolved: true };
    }
    return {
      name: nextNumericAlias(prefixed, usedAliases),
      defaultName,
      aliasResolved: true,
    };
  }

  return {
    name: nextNumericAlias(defaultName, usedAliases),
    defaultName,
    aliasResolved: true,
  };
}

export function isPathWithinRoot(rootFolder: string, candidatePath: string): boolean {
  const relative = path.relative(rootFolder, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function formatSelectionEntryLabel(entry: SourceSelectionEntry): string {
  if (!entry.configured && entry.aliasResolved) {
    return `${entry.source.name} [${entry.status}] ${entry.source.path} (resolved from ${entry.defaultName})`;
  }
  return `${entry.source.name} [${entry.status}] ${entry.source.path}`;
}

export function formatSelectionSummary(
  result: ReconcileSelectionResult,
  session: SourceSelectionSession,
  selectedPaths: string[],
): string[] {
  const selected = new Set(selectedPaths);
  const keptEntries = session.entries.filter((entry) => selected.has(entry.source.path));
  const lines = [
    `Updated sources: added ${result.addedCount}, removed ${result.removedCount}, kept ${result.keptCount}.`,
    "Saved aliases:",
    ...keptEntries.map((entry) => {
      const resolvedNote = !entry.configured && entry.aliasResolved ? ` (resolved from ${entry.defaultName})` : "";
      return `  ${entry.source.name} -> ${entry.source.path}${resolvedNote}`;
    }),
  ];
  return lines;
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
  const usedAliases = new Set(config.sources.map((source) => normalizeAlias(source.name)));
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

    const alias = resolveNewSourceAlias(rootFolder, discoveredPath, usedAliases);

    const source: Source = {
      type: "git-local",
      path: discoveredPath,
      name: alias.name,
    };
    entriesByPath.set(discoveredPath, {
      source,
      configured: false,
      discovered: true,
    });
    usedAliases.add(normalizeAlias(alias.name));
  }

  const baseEntries = [...entriesByPath.values()].sort((a, b) => a.source.path.localeCompare(b.source.path));
  const validations = await validateSources(baseEntries.map((entry) => entry.source));

  const entries = baseEntries.map((entry, index) => {
    const validation = validations[index];
    const defaultName = path.basename(entry.source.path);
    return {
      source: entry.source,
      checked: entry.configured,
      configured: entry.configured,
      discovered: entry.discovered,
      defaultName,
      aliasResolved: !entry.configured && entry.source.name !== defaultName,
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
