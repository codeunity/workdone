#!/usr/bin/env bun

import path from "node:path";
import { stat } from "node:fs/promises";
import { loadConfig, saveConfig } from "./core/config";
import { getGlobalGitUserEmail, syncGitSource } from "./core/git";
import { printReport, printValidationResults } from "./core/output";
import { getConfigPath, normalizeInputPath } from "./core/paths";
import { buildWeeklyReport } from "./core/report";
import { parseWeekOption, resolveWeekRange, resolveDateRange, resolveShortcutRange } from "./core/time";
import type { DateRange, Shortcut } from "./core/time";
import { createNodeSelectionIo, runSelectionSession } from "./core/selection";
import { addUser, listUsers, removeUser } from "./core/users";
import { VERSION } from "./core/version";
import {
  buildSourceSelectionSession,
  formatSelectionEntryLabel,
  formatSelectionSummary,
  reconcileSourceSelection,
} from "./core/source-selection";
import { validateSource, validateSources } from "./core/validate";
import type { Source } from "./types";

function printTopHelp(): void {
  console.log(`workdone - Weekly work report from your registered sources

USAGE
  workdone <command> [options]

COMMANDS
  config                 Print config file location
  report                 Print your work report (default: current week; use --week, --since, --until, --today, etc.)
  sync                   Fetch all remotes for registered sources before reporting across machines
  sources list           List registered sources
  sources add <path>     Register a local git repository source (use --name for alias)
  sources remove <arg>   Remove a registered source by alias or path
  sources validate       Validate all registered sources
  sources select <folder>  Interactively choose git repos in a folder
  users list             List configured author emails (falls back to global git email if empty)
  users add <email>      Add an author email to include in reports
  users remove <email>   Remove a configured author email
  help [command]         Show help for a command

GLOBAL OPTIONS
  -h, --help             Show help
  -v, --version          Show version

GET STARTED
  workdone sources select ~/code
  workdone sync
  workdone sources validate
  workdone report --view timeline

EXAMPLES
  workdone sync
  workdone sync --source myrepo
  workdone report
  workdone report --view timeline
  workdone report --view by-source
  workdone report --format markdown
  workdone report --source myrepo --view timeline
  workdone report --files --view by-source
  workdone help report`);
}

function printReportHelp(): void {
  console.log(`Print a work report for a configurable date range.

USAGE
  workdone report [options]

DESCRIPTION
  Generates a report for the specified date range (default: the current local week,
  Monday 00:00 (local time) through now).

  Includes only commits authored by the configured users (workdone users list).
  If no users are configured, falls back to your global git email:
  git config --global user.email

  Scans commits reachable from local branches and remote-tracking
  branches already present in the local clone.

DATE RANGE OPTIONS (mutually exclusive)
  --week <value>         Relative or absolute ISO week
                           Relative: --week=-1 (last week), --week=-2 (two weeks ago)
                           NOTE: use --week=-1 syntax (with =) for negative values
                           Absolute: --week=5 (ISO week 5 of current year)
                                     --week=2026-5 (ISO week 5 of 2026)
                           Weeks run Monday 00:00:00 through Sunday 23:59:59 (local time)
                           Week numbers follow ISO 8601
  --since <YYYY-MM-DD>   Start date (00:00:00 local time); end defaults to now
  --until <YYYY-MM-DD>   End date (23:59:59 local time); requires --since
  --today                Today from 00:00:00 until now
  --yesterday            Yesterday from 00:00:00 through 23:59:59
  --this-month           First day of current month through now
  --last-month           Full previous calendar month

VIEWS
  timeline               Linear commit overview grouped by day (default)
  by-source              Commits grouped by source, then by day

FORMATS
  text                   Terminal-friendly aligned columns
  markdown               Markdown headings and tables for sharing/export

OUTPUT
  - Commits grouped by day
  - For each commit:
      source alias, hash, time, subject, changed files, aggregated line changes
  - With --files:
      include per-file path and line changes

OPTIONS
  -s, --source <source>  Limit report to one source (alias or path)
  -f, --files            Include per-file changes
  -V, --view <view>      Report layout: timeline | by-source (default: timeline)
  -F, --format <format>  Output format: text | markdown (default: text)
  -h, --help             Show help

EXAMPLES
  workdone report
  workdone report --week=-1
  workdone report --week=-2
  workdone report --week=5
  workdone report --week=2026-5
  workdone report --since 2026-03-20
  workdone report --since 2026-03-20 --until 2026-03-30
  workdone report --today
  workdone report --yesterday
  workdone report --this-month
  workdone report --last-month
  workdone report --view timeline
  workdone report --view by-source
  workdone report --format markdown
  workdone report --files --format markdown
  workdone report --source api --view by-source --format markdown

REQUIREMENTS
  - git global user.email must be set (or users configured via workdone users add)
  - selected/registered source must be a valid local git repository`);
}

function printSyncHelp(): void {
  console.log(`Fetch all remotes for registered sources.

USAGE
  workdone sync [options]

DESCRIPTION
  Runs 'git fetch --all --prune' for each selected source so work pushed
  from another machine becomes available to local reporting.

OPTIONS
  -s, --source <source>  Sync one source by alias or path
  -h, --help             Show help

RESULT
  - Prints one line per source: OK or FAIL
  - Continues through all selected sources
  - Exit code 0 when all sources synced, 1 when any source failed

EXAMPLES
  workdone sync
  workdone sync --source api
  workdone sync --source ~/code/work-repo`);
}

function printConfigHelp(): void {
  console.log(`Print the config file location.

USAGE
  workdone config [options]

DESCRIPTION
  Prints the absolute path to the config file.

OPTIONS
  -h, --help             Show help

EXAMPLES
  workdone config`);
}

function printSourcesHelp(): void {
  console.log(`Manage report sources.

USAGE
  workdone sources <command> [options]

COMMANDS
  list                   List registered sources
  add <path>             Add a local git repository source
  remove <path-or-name>  Remove a source by path or alias
  validate               Validate all registered sources
  select <folder>        Interactively choose git repos in a folder

EXAMPLES
  workdone sources list
  workdone sources add ~/code/project-a --name api
  workdone sources remove api
  workdone sources validate
  workdone sources select ~/code
  workdone sources select ~/code --max-depth 2`);
}

function printUsersHelp(): void {
  console.log(`Manage the list of author emails included in reports.

USAGE
  workdone users <command>

COMMANDS
  list             List configured author emails
  add <email>      Add an author email
  remove <email>   Remove an author email

DESCRIPTION
  When one or more emails are configured, workdone report includes commits
  from all of them (OR logic). When the list is empty, workdone falls back
  to your global git user.email as before.

  When multiple users are configured, each commit line in the report is
  annotated with the author's email.

EXAMPLES
  workdone users list
  workdone users add alice@example.com
  workdone users add bob@example.com
  workdone users remove alice@example.com`);
}

function printSourcesSelectHelp(): void {
  console.log(`Interactively choose local git repositories under a folder.

USAGE
  workdone sources select <folder> [options]

ARGUMENTS
  <folder>               Root folder to scan recursively

OPTIONS
  --max-depth <n>        Maximum scan depth (default: 3)
  -h, --help             Show help

BEHAVIOR
  - Scans recursively from <folder> up to max depth
  - Requires an interactive terminal (TTY)
  - Shows relevant configured and discovered repositories in a path-ordered checklist
  - Space toggles, Enter confirms, q/Esc/Ctrl+C cancels
  - Displays compact validation status for each item
  - Preserves configured aliases and resolves new alias collisions deterministically

RESULT
  - On confirm, checked repositories are kept/added and unchecked relevant repositories are removed
  - Save summary shows the aliases that will be persisted
  - On cancel, no changes are written

EXAMPLES
  workdone sources select ~/code
  workdone sources select ~/code --max-depth 2`);
}

function printSourcesListHelp(): void {
  console.log(`List all registered sources.

USAGE
  workdone sources list [options]

OUTPUT
  Index, alias, type, normalized absolute path.

OPTIONS
  -h, --help             Show help

EXAMPLES
  workdone sources list`);
}

function printSourcesAddHelp(): void {
  console.log(`Register a new local git repository source.

USAGE
  workdone sources add <path> [options]

ARGUMENTS
  <path>                 Path to a local git repository

OPTIONS
  --name <name>          Alias for this source (default: folder name)
  -h, --help             Show help

BEHAVIOR
  - Path is normalized to an absolute canonical path
  - Fails if path does not exist, is not a directory, or is not a git repo
  - Duplicate paths are rejected
  - Alias names must be unique (case-insensitive)

EXAMPLES
  workdone sources add .
  workdone sources add ~/code/work-repo
  workdone sources add ~/code/work-repo --name work
  workdone sources add "C:\\dev\\project-x"`);
}

function printSourcesRemoveHelp(): void {
  console.log(`Remove a registered source by path or alias.

USAGE
  workdone sources remove <path-or-name> [options]

ARGUMENTS
  <path-or-name>         Alias (case-insensitive) or source path

BEHAVIOR
  - Alias matches are case-insensitive
  - Path input is normalized before matching
  - Fails if source is not registered

OPTIONS
  -h, --help             Show help

EXAMPLES
  workdone sources remove api
  workdone sources remove API
  workdone sources remove ~/code/work-repo`);
}

function printSourcesValidateHelp(): void {
  console.log(`Validate all registered sources and report their status.

USAGE
  workdone sources validate [options]

CHECKS
  - path exists
  - path is a directory
  - path is a git repository
  - path is accessible

RESULT
  - Prints status per source: VALID or INVALID (<reason>)
  - Prints summary: "<n> valid, <m> invalid"
  - Exit code 0 when all valid, 1 when any invalid

OPTIONS
  -h, --help             Show help

EXAMPLES
  workdone sources validate`);
}

function suggestCommand(unknown: string): string | null {
  if (unknown === "sourced") {
    return "sources";
  }
  if (unknown === "source") {
    return "sources";
  }
  if (unknown === "user") {
    return "users";
  }
  return null;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function normalizeAlias(name: string): string {
  return name.trim().toLowerCase();
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function padLeft(value: string, width: number): string {
  return value.padStart(width, " ");
}

function printSourcesTable(sources: Source[]): void {
  const indexHeader = "#";
  const nameHeader = "Name";
  const typeHeader = "Type";
  const pathHeader = "Path";

  const indexWidth = Math.max(indexHeader.length, String(sources.length).length);
  const nameWidth = Math.max(nameHeader.length, ...sources.map((source) => source.name.length));
  const typeWidth = Math.max(typeHeader.length, ...sources.map((source) => source.type.length));

  console.log(
    `${padLeft(indexHeader, indexWidth)}  ${padRight(nameHeader, nameWidth)}  ${padRight(typeHeader, typeWidth)}  ${pathHeader}`,
  );
  console.log(`${"-".repeat(indexWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(typeWidth)}  ${"-".repeat(pathHeader.length)}`);

  sources.forEach((source, idx) => {
    const index = String(idx + 1);
    console.log(
      `${padLeft(index, indexWidth)}  ${padRight(source.name, nameWidth)}  ${padRight(source.type, typeWidth)}  ${source.path}`,
    );
  });
}

function parseSourcesAddOptions(args: string[]): { pathArg: string; name?: string } {
  const pathArg = args[1];
  if (!pathArg) {
    fail("missing required argument '<path>'\nTry: workdone sources add --help");
  }

  let name: string | undefined;
  for (let i = 2; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--name") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--name'\nTry: workdone sources add --help");
      }
      name = value;
      i += 1;
      continue;
    }
    fail(`unknown option '${token}'\nTry: workdone sources add --help`);
  }

  return { pathArg, name };
}

function parseSourcesSelectOptions(args: string[]): { folder: string; maxDepth: number } {
  const folder = args[1];
  if (!folder || folder.startsWith("-")) {
    fail("missing required argument '<folder>'\nTry: workdone sources select --help");
  }

  let maxDepth = 3;

  for (let i = 2; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--max-depth") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--max-depth'\nTry: workdone sources select --help");
      }
      if (!/^\d+$/.test(value)) {
        fail("invalid value for '--max-depth': must be a non-negative integer");
      }
      const parsed = Number.parseInt(value, 10);
      maxDepth = parsed;
      i += 1;
      continue;
    }
    fail(`unknown option '${token}'\nTry: workdone sources select --help`);
  }

  return { folder, maxDepth };
}

function parseReportOptions(args: string[]): {
  sourceSelector?: string;
  files: boolean;
  view: "timeline" | "by-source";
  format: "text" | "markdown";
  week?: string;
  since?: string;
  until?: string;
  shortcut?: Shortcut;
} {
  let sourceSelector: string | undefined;
  let files = false;
  let view: "timeline" | "by-source" = "timeline";
  let format: "text" | "markdown" = "text";
  let week: string | undefined;
  let since: string | undefined;
  let until: string | undefined;
  let shortcut: Shortcut | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "-h" || token === "--help") {
      printReportHelp();
      process.exit(0);
    }
    if (token === "--source" || token === "-s") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--source'\nTry: workdone report --help");
      }
      sourceSelector = value;
      i += 1;
      continue;
    }
    if (token === "--files" || token === "-f") {
      files = true;
      continue;
    }
    if (token === "--view" || token === "-V") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--view'\nTry: workdone report --help");
      }
      if (value !== "timeline" && value !== "by-source") {
        fail(`invalid value for '--view': ${value}\nAllowed values: timeline, by-source\nTry: workdone report --help`);
      }
      view = value;
      i += 1;
      continue;
    }
    if (token === "--format" || token === "-F") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--format'\nTry: workdone report --help");
      }
      if (value !== "text" && value !== "markdown") {
        fail(`invalid value for '--format': ${value}\nAllowed values: text, markdown\nTry: workdone report --help`);
      }
      format = value;
      i += 1;
      continue;
    }
    // Support both "--week value" and "--week=value" (needed for negative numbers like --week=-1)
    if (token === "--week") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--week'\nTry: workdone report --help");
      }
      week = value;
      i += 1;
      continue;
    }
    if (token.startsWith("--week=")) {
      week = token.slice("--week=".length);
      if (!week) {
        fail("missing value for '--week'\nTry: workdone report --help");
      }
      continue;
    }
    if (token === "--since") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--since'\nTry: workdone report --help");
      }
      since = value;
      i += 1;
      continue;
    }
    if (token === "--until") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--until'\nTry: workdone report --help");
      }
      until = value;
      i += 1;
      continue;
    }
    if (token === "--today") {
      if (shortcut !== undefined) {
        fail(`--today and --${shortcut} cannot be used together.\nTry: workdone report --help`);
      }
      shortcut = "today";
      continue;
    }
    if (token === "--yesterday") {
      if (shortcut !== undefined) {
        fail(`--yesterday and --${shortcut} cannot be used together.\nTry: workdone report --help`);
      }
      shortcut = "yesterday";
      continue;
    }
    if (token === "--this-month") {
      if (shortcut !== undefined) {
        fail(`--this-month and --${shortcut} cannot be used together.\nTry: workdone report --help`);
      }
      shortcut = "this-month";
      continue;
    }
    if (token === "--last-month") {
      if (shortcut !== undefined) {
        fail(`--last-month and --${shortcut} cannot be used together.\nTry: workdone report --help`);
      }
      shortcut = "last-month";
      continue;
    }
    fail(`unknown option '${token}'\nTry: workdone report --help`);
  }
  return { sourceSelector, files, view, format, week, since, until, shortcut };
}

function parseSyncOptions(args: string[]): { sourceSelector?: string } {
  let sourceSelector: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "-h" || token === "--help") {
      printSyncHelp();
      process.exit(0);
    }
    if (token === "--source" || token === "-s") {
      const value = args[i + 1];
      if (!value) {
        fail("missing value for '--source'\nTry: workdone sync --help");
      }
      sourceSelector = value;
      i += 1;
      continue;
    }
    fail(`unknown option '${token}'\nTry: workdone sync --help`);
  }

  return { sourceSelector };
}

function findSourceByAliasOrPath(selector: string, sources: Source[]): Source | null {
  const alias = normalizeAlias(selector);
  const byAlias = sources.find((source) => normalizeAlias(source.name) === alias);
  if (byAlias) {
    return byAlias;
  }

  const normalizedPath = normalizeInputPath(selector);
  const byPath = sources.find((source) => source.path === normalizedPath);
  return byPath ?? null;
}

async function handleSources(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "-h" || sub === "--help") {
    printSourcesHelp();
    return;
  }

  if (sub === "list") {
    if (args[1] === "-h" || args[1] === "--help") {
      printSourcesListHelp();
      return;
    }
    const config = await loadConfig();
    if (config.sources.length === 0) {
      console.log("No sources registered.");
      console.log("Add one with: workdone sources add <path>");
      return;
    }
    printSourcesTable(config.sources);
    return;
  }

  if (sub === "add") {
    if (args[1] === "-h" || args[1] === "--help") {
      printSourcesAddHelp();
      return;
    }
    const parsed = parseSourcesAddOptions(args);
    const rawPath = parsed.pathArg;
    const normalized = normalizeInputPath(rawPath);
    const defaultName = path.basename(normalized);
    const requestedName = parsed.name?.trim() ?? defaultName;
    if (requestedName.trim() === "") {
      fail("source name cannot be empty\nTry: workdone sources add --help");
    }
    const source = { type: "git-local" as const, path: normalized, name: requestedName };
    const validation = await validateSource(source);
    if (!validation.valid) {
      fail(`cannot add source '${normalized}': ${validation.reason}\nTry: workdone sources add --help`);
    }

    const config = await loadConfig();
    if (config.sources.some((entry) => entry.path === source.path)) {
      fail(`source already registered: ${normalized}`);
    }
    if (config.sources.some((entry) => normalizeAlias(entry.name) === normalizeAlias(source.name))) {
      fail(`source name already registered: ${source.name}\nTry: workdone sources add <path> --name <unique-name>`);
    }
    config.sources.push(source);
    await saveConfig(config);
    console.log(`Added source: ${source.name} (${normalized})`);
    return;
  }

  if (sub === "remove") {
    if (args[1] === "-h" || args[1] === "--help") {
      printSourcesRemoveHelp();
      return;
    }
    const pathOrName = args[1];
    if (!pathOrName) {
      fail("missing required argument '<path-or-name>'\nTry: workdone sources remove --help");
    }
    const config = await loadConfig();
    const aliasMatch = config.sources.find((source) => normalizeAlias(source.name) === normalizeAlias(pathOrName));
    const normalizedPath = normalizeInputPath(pathOrName);
    const pathMatch = config.sources.find((source) => source.path === normalizedPath);
    const target = aliasMatch ?? pathMatch;
    if (!target) {
      fail(`source not found: ${pathOrName}\nTry: workdone sources list`);
    }
    config.sources = config.sources.filter((source) => source.path !== target.path);
    await saveConfig(config);
    console.log(`Removed source: ${target.name} (${target.path})`);
    return;
  }

  if (sub === "validate") {
    if (args[1] === "-h" || args[1] === "--help") {
      printSourcesValidateHelp();
      return;
    }
    const config = await loadConfig();
    if (config.sources.length === 0) {
      console.log("No sources registered.");
      console.log("Add one with: workdone sources add <path>");
      return;
    }
    const results = await validateSources(config.sources);
    const invalidCount = printValidationResults(results);
    if (invalidCount > 0) {
      process.exit(1);
    }
    return;
  }

  if (sub === "select") {
    if (args[1] === "-h" || args[1] === "--help") {
      printSourcesSelectHelp();
      return;
    }

    const options = parseSourcesSelectOptions(args);
    const rootFolder = normalizeInputPath(options.folder);
    const rootStat = await stat(rootFolder).catch(() => null);
    if (!rootStat) {
      fail(`folder not found: ${rootFolder}`);
    }
    if (!rootStat.isDirectory()) {
      fail(`not a directory: ${rootFolder}`);
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      fail("sources select requires an interactive terminal (TTY)");
    }

    const config = await loadConfig();
    const session = await buildSourceSelectionSession(rootFolder, options.maxDepth, config);
    if (session.entries.length === 0) {
      console.log("No relevant sources found.");
      return;
    }

    const selection = await runSelectionSession(
      `Edit sources for ${rootFolder}`,
      session.entries.map((entry) => ({
        value: entry.source.path,
        label: formatSelectionEntryLabel(entry),
        checked: entry.checked,
      })),
      createNodeSelectionIo(),
      `Found ${session.discoveredCount} repos; showing ${session.entries.length} relevant entries; skipped ${session.skippedCount}.`,
    );

    if (!selection.confirmed) {
      console.log("Cancelled: no changes written");
      return;
    }

    const result = reconcileSourceSelection(config, session, selection.selectedValues);
    await saveConfig(result.config);

    for (const line of formatSelectionSummary(result, session, selection.selectedValues)) {
      console.log(line);
    }
    console.log(
      `Found ${session.discoveredCount} repos, showing ${session.entries.length} relevant entries, skipped ${session.skippedCount}.`,
    );
    return;
  }

  fail(`unknown subcommand 'sources ${sub}'\nTry: workdone sources --help`);
}

async function handleUsers(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "-h" || sub === "--help") {
    printUsersHelp();
    return;
  }

  if (sub === "list") {
    const config = await loadConfig();
    const users = listUsers(config);
    if (users.length === 0) {
      console.log("No users configured.");
      console.log("Falling back to global git user.email for reports.");
      console.log("Add a user with: workdone users add <email>");
    } else {
      for (const email of users) {
        console.log(email);
      }
    }
    return;
  }

  if (sub === "add") {
    const email = args[1];
    if (!email) {
      fail("missing argument: workdone users add <email>");
    }
    const config = await loadConfig();
    const updated = addUser(config, email);
    if (updated === config) {
      return;
    }
    await saveConfig(updated);
    console.log(`Added user: ${email.trim()}`);
    return;
  }

  if (sub === "remove") {
    const email = args[1];
    if (!email) {
      fail("missing argument: workdone users remove <email>");
    }
    const config = await loadConfig();
    const updated = removeUser(config, email);
    if (updated === config) {
      return;
    }
    await saveConfig(updated);
    console.log(`Removed user: ${email.trim()}`);
    return;
  }

  fail(`unknown subcommand 'users ${sub}'\nTry: workdone users --help`);
}

async function handleReport(args: string[]): Promise<void> {
  const options = parseReportOptions(args);

  // Resolve and validate the date range before any async I/O so that
  // invalid flag combinations fail fast regardless of the environment.
  let dateRange: DateRange | undefined;
  if (options.week !== undefined) {
    if (options.since !== undefined) {
      fail("--week and --since cannot be used together.\nTry: workdone report --help");
    }
    if (options.until !== undefined) {
      fail("--week and --until cannot be used together.\nTry: workdone report --help");
    }
    if (options.shortcut !== undefined) {
      fail(`--week and --${options.shortcut} cannot be used together.\nTry: workdone report --help`);
    }
    try {
      dateRange = resolveWeekRange(parseWeekOption(options.week));
    } catch (err) {
      fail(String(err instanceof Error ? err.message : err) + "\nTry: workdone report --help");
    }
  } else if (options.shortcut !== undefined) {
    if (options.since !== undefined) {
      fail(`--${options.shortcut} and --since cannot be used together.\nTry: workdone report --help`);
    }
    if (options.until !== undefined) {
      fail(`--${options.shortcut} and --until cannot be used together.\nTry: workdone report --help`);
    }
    dateRange = resolveShortcutRange(options.shortcut);
  } else if (options.since !== undefined) {
    try {
      dateRange = resolveDateRange(options.since, options.until);
    } catch (err) {
      fail(String(err instanceof Error ? err.message : err) + "\nTry: workdone report --help");
    }
  } else if (options.until !== undefined) {
    fail("--until requires --since to also be specified.\nTry: workdone report --help");
  }

  const config = await loadConfig();

  if (config.sources.length === 0) {
    console.log("No sources registered.");
    console.log("Get started:");
    console.log("  workdone sources add <path>");
    console.log("  workdone sources validate");
    return;
  }

  const configuredUsers = listUsers(config);
  const effectiveUsers = configuredUsers.length > 0
    ? configuredUsers
    : [(await getGlobalGitUserEmail()).trim().toLowerCase()];

  if (options.sourceSelector) {
    const selectedSource = findSourceByAliasOrPath(options.sourceSelector, config.sources);
    if (!selectedSource) {
      fail(`source not registered: ${options.sourceSelector}\nTry: workdone sources list`);
    }
    const validation = await validateSource(selectedSource);
    if (!validation.valid) {
      fail(`selected source is invalid: ${validation.reason}\nTry: workdone sources validate`);
    }
    const report = await buildWeeklyReport([selectedSource], effectiveUsers, new Date(), dateRange);
    printReport(report, { includeFiles: options.files, view: options.view, format: options.format, showAuthor: effectiveUsers.length > 1 });
    return;
  }

  const validations = await validateSources(config.sources);
  const validSources = validations.filter((result) => result.valid).map((result) => result.source);
  const invalidSources = validations.filter((result) => !result.valid);
  if (invalidSources.length > 0) {
    console.log("Skipping invalid sources:");
    for (const invalid of invalidSources) {
      console.log(`- ${invalid.source.name} (${invalid.reason})`);
    }
    console.log("");
  }

  if (validSources.length === 0) {
    fail("no valid sources available\nTry: workdone sources validate");
  }

  const report = await buildWeeklyReport(validSources, effectiveUsers, new Date(), dateRange);
  printReport(report, { includeFiles: options.files, view: options.view, format: options.format, showAuthor: effectiveUsers.length > 1 });
}

async function handleSync(args: string[]): Promise<void> {
  const options = parseSyncOptions(args);
  const config = await loadConfig();

  if (config.sources.length === 0) {
    console.log("No sources registered.");
    console.log("Add one with: workdone sources add <path>");
    return;
  }

  let selectedSources = config.sources;
  if (options.sourceSelector) {
    const selectedSource = findSourceByAliasOrPath(options.sourceSelector, config.sources);
    if (!selectedSource) {
      fail(`source not registered: ${options.sourceSelector}\nTry: workdone sources list`);
    }
    selectedSources = [selectedSource];
  }

  const validations = await validateSources(selectedSources);
  const validSources = validations.filter((result) => result.valid).map((result) => result.source);
  const invalidSources = validations.filter((result) => !result.valid);

  let failureCount = 0;

  for (const invalid of invalidSources) {
    console.log(`FAIL ${invalid.source.name}  invalid source (${invalid.reason})`);
    failureCount += 1;
  }

  for (const source of validSources) {
    try {
      await syncGitSource(source.path);
      console.log(`OK   ${source.name}  fetched all remotes`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL ${source.name}  ${message}`);
      failureCount += 1;
    }
  }

  const successCount = validSources.length - (failureCount - invalidSources.length);
  console.log(`\nSynced ${successCount} sources, failed ${failureCount}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

function printHelpForPath(pathParts: string[]): void {
  if (pathParts.length === 0) {
    printTopHelp();
    return;
  }
  const joined = pathParts.join(" ");
  switch (joined) {
    case "config":
      printConfigHelp();
      return;
    case "report":
      printReportHelp();
      return;
    case "sync":
      printSyncHelp();
      return;
    case "sources":
      printSourcesHelp();
      return;
    case "sources list":
      printSourcesListHelp();
      return;
    case "sources add":
      printSourcesAddHelp();
      return;
    case "sources remove":
      printSourcesRemoveHelp();
      return;
    case "sources validate":
      printSourcesValidateHelp();
      return;
    case "sources select":
      printSourcesSelectHelp();
      return;
    case "users":
      printUsersHelp();
      return;
    default:
      fail(`unknown help topic '${joined}'\nTry: workdone --help`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "-h" || command === "--help") {
    printTopHelp();
    return;
  }

  if (command === "-v" || command === "--version") {
    console.log(VERSION);
    return;
  }

  if (command === "help") {
    printHelpForPath(args.slice(1));
    return;
  }

  if (command === "config") {
    if (args[1] === "-h" || args[1] === "--help") {
      printConfigHelp();
      return;
    }
    console.log(getConfigPath());
    return;
  }

  if (command === "report") {
    await handleReport(args.slice(1));
    return;
  }

  if (command === "sync") {
    await handleSync(args.slice(1));
    return;
  }

  if (command === "sources") {
    await handleSources(args.slice(1));
    return;
  }

  if (command === "users") {
    await handleUsers(args.slice(1));
    return;
  }

  const suggestion = suggestCommand(command);
  if (suggestion) {
    fail(`unknown command '${command}'\nDid you mean '${suggestion}'?\nTry: workdone --help`);
  }
  fail(`unknown command '${command}'\nTry: workdone --help`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
