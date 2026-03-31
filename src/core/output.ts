import { toDateKey, toDayLabel, toTimeLabel } from "./time";
import type { ValidationResult, WeeklyReport } from "../types";

interface PrintReportOptions {
  includeFiles?: boolean;
  view?: "timeline" | "by-source";
  format?: "text" | "markdown";
  showAuthor?: boolean;
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function padLeft(value: string, width: number): string {
  return value.padStart(width, " ");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

interface Totals {
  commits: number;
  files: number;
  added: number;
  deleted: number;
  changed: number;
  binaries: number;
}

function computeTotals(commits: WeeklyReport["days"][number]["commits"]): Totals {
  let files = 0;
  let added = 0;
  let deleted = 0;
  let binaries = 0;

  for (const commit of commits) {
    files += commit.files.length;
    for (const file of commit.files) {
      added += file.added;
      deleted += file.deleted;
      if (file.binary) {
        binaries += 1;
      }
    }
  }

  return {
    commits: commits.length,
    files,
    added,
    deleted,
    changed: added + deleted,
    binaries,
  };
}

function formatTotalsLine(prefix: string, totals: Totals): string {
  const binaryLabel = totals.binaries === 1 ? "binary" : "binaries";
  return `${prefix}${totals.commits} commits, ${totals.files} files, +${totals.added} -${totals.deleted}, ${totals.changed}, ${totals.binaries} ${binaryLabel}`;
}

function commitTotals(commit: WeeklyReport["days"][number]["commits"][number]): {
  fileCount: number;
  addedTotal: number;
  deletedTotal: number;
  changedTotal: number;
  binaryCount: number;
} {
  const fileCount = commit.files.length;
  const addedTotal = commit.files.reduce((sum, file) => sum + file.added, 0);
  const deletedTotal = commit.files.reduce((sum, file) => sum + file.deleted, 0);
  const changedTotal = addedTotal + deletedTotal;
  const binaryCount = commit.files.filter((file) => file.binary).length;
  return { fileCount, addedTotal, deletedTotal, changedTotal, binaryCount };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function formatValidationReason(reason: NonNullable<ValidationResult["reason"]>): string {
  switch (reason) {
    case "missing":
      return "path does not exist";
    case "not_directory":
      return "path is not a directory";
    case "not_git_repo":
      return "path is not a git repository";
    case "not_accessible":
      return "path is not accessible";
    default:
      return "unknown error";
  }
}

export function printValidationResults(results: ValidationResult[]): number {
  let validCount = 0;
  let invalidCount = 0;

  const rows = results.map((result) => {
    const status = result.valid ? "VALID" : "INVALID";
    const reason = result.valid ? "" : formatValidationReason(result.reason!);
    if (result.valid) {
      validCount += 1;
    } else {
      invalidCount += 1;
    }
    return {
      status,
      name: result.source.name,
      type: result.source.type,
      path: result.source.path,
      reason,
    };
  });

  const statusHeader = "Status";
  const nameHeader = "Name";
  const typeHeader = "Type";
  const pathHeader = "Path";
  const reasonHeader = "Reason";

  const statusWidth = Math.max(statusHeader.length, ...rows.map((row) => row.status.length));
  const nameWidth = Math.max(nameHeader.length, ...rows.map((row) => row.name.length));
  const typeWidth = Math.max(typeHeader.length, ...rows.map((row) => row.type.length));
  const pathWidth = Math.max(pathHeader.length, ...rows.map((row) => row.path.length));

  console.log(
    `${padRight(statusHeader, statusWidth)}  ${padRight(nameHeader, nameWidth)}  ${padRight(typeHeader, typeWidth)}  ${padRight(pathHeader, pathWidth)}  ${reasonHeader}`,
  );
  console.log(
    `${"-".repeat(statusWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(typeWidth)}  ${"-".repeat(pathWidth)}  ${"-".repeat(reasonHeader.length)}`,
  );

  for (const row of rows) {
    console.log(
      `${padRight(row.status, statusWidth)}  ${padRight(row.name, nameWidth)}  ${padRight(row.type, typeWidth)}  ${padRight(row.path, pathWidth)}  ${row.reason}`,
    );
  }

  console.log(`\n${validCount} valid, ${invalidCount} invalid`);
  return invalidCount;
}

function printReportMarkdown(report: WeeklyReport, options: PrintReportOptions): void {
  console.log("# Workdone Report");
  console.log(`Week starting: ${toDateKey(report.rangeStart)} (Monday, local time)`);

  if (report.days.length === 0) {
    console.log("\nNo work found this week.");
    return;
  }

  const view = options.view ?? "timeline";

  if (view === "by-source") {
    const allCommits = report.days.flatMap((day) => day.commits);
    const sourceMap = new Map<string, typeof allCommits>();
    for (const commit of allCommits) {
      const existing = sourceMap.get(commit.repoName);
      if (existing) {
        existing.push(commit);
      } else {
        sourceMap.set(commit.repoName, [commit]);
      }
    }

    const sources = [...sourceMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [sourceName, sourceCommits] of sources) {
      sourceCommits.sort((a, b) => b.date.getTime() - a.date.getTime());
      const sourceTotals = computeTotals(sourceCommits);

      console.log(`\n## ${escapeMarkdownCell(sourceName)}`);
      console.log(
        `Source total: ${sourceTotals.commits} commits, ${sourceTotals.files} files, +${sourceTotals.added} -${sourceTotals.deleted}, ${sourceTotals.changed}, ${sourceTotals.binaries} ${sourceTotals.binaries === 1 ? "binary" : "binaries"}`,
      );

      const dayMap = new Map<string, typeof sourceCommits>();
      for (const commit of sourceCommits) {
        const key = toDateKey(commit.date);
        const existing = dayMap.get(key);
        if (existing) {
          existing.push(commit);
        } else {
          dayMap.set(key, [commit]);
        }
      }

      const sourceDays = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (const [dayKey, commits] of sourceDays) {
        commits.sort((a, b) => b.date.getTime() - a.date.getTime());
        const dayTotals = computeTotals(commits);
        const dayLabel = toDayLabel(new Date(`${dayKey}T00:00:00`));

        console.log(`\n### ${dayLabel}`);
        console.log(formatTotalsLine("Day total: ", dayTotals));
        const bySourceHeader = options.showAuthor
          ? "\n| Time | Hash | Author | Files | + | - | Δ | Bin | Subject |"
          : "\n| Time | Hash | Files | + | - | Δ | Bin | Subject |";
        const bySourceSep = options.showAuthor
          ? "|---|---|---|---:|---:|---:|---:|---:|---|"
          : "|---|---|---:|---:|---:|---:|---:|---|";
        console.log(bySourceHeader);
        console.log(bySourceSep);

        for (const commit of commits) {
          const shortHash = commit.hash.slice(0, 7);
          const totals = commitTotals(commit);
          const authorCell = options.showAuthor ? ` ${escapeMarkdownCell(commit.authorEmail)} |` : "";
          console.log(
            `| ${toTimeLabel(commit.date)} | ${shortHash} |${authorCell} ${totals.fileCount} | ${totals.addedTotal} | ${totals.deletedTotal} | ${totals.changedTotal} | ${totals.binaryCount} | ${escapeMarkdownCell(commit.subject)} |`,
          );

          if (options.includeFiles && commit.files.length > 0) {
            console.log(`\n#### ${shortHash} files`);
            console.log("| Path | + | - | Δ | Type |");
            console.log("|---|---:|---:|---:|---|");
            for (const file of commit.files) {
              console.log(
                `| ${escapeMarkdownCell(file.path)} | ${file.added} | ${file.deleted} | ${file.changedLines} | ${file.binary ? "binary" : "text"} |`,
              );
            }
          }
        }
      }
    }
    return;
  }

  for (const day of report.days) {
    console.log(`\n## ${day.label}`);
    const dayTotals = computeTotals(day.commits);
    console.log(formatTotalsLine("Day total: ", dayTotals));
    const timelineHeader = options.showAuthor
      ? "\n| Time | Source | Hash | Author | Files | + | - | Δ | Bin | Subject |"
      : "\n| Time | Source | Hash | Files | + | - | Δ | Bin | Subject |";
    const timelineSep = options.showAuthor
      ? "|---|---|---|---|---:|---:|---:|---:|---:|---|"
      : "|---|---|---|---:|---:|---:|---:|---:|---|";
    console.log(timelineHeader);
    console.log(timelineSep);

    for (const commit of day.commits) {
      const shortHash = commit.hash.slice(0, 7);
      const totals = commitTotals(commit);
      const authorCell = options.showAuthor ? ` ${escapeMarkdownCell(commit.authorEmail)} |` : "";
      console.log(
        `| ${toTimeLabel(commit.date)} | ${escapeMarkdownCell(commit.repoName)} | ${shortHash} |${authorCell} ${totals.fileCount} | ${totals.addedTotal} | ${totals.deletedTotal} | ${totals.changedTotal} | ${totals.binaryCount} | ${escapeMarkdownCell(commit.subject)} |`,
      );

      if (options.includeFiles && commit.files.length > 0) {
        console.log(`\n### ${shortHash} files`);
        console.log("| Path | + | - | Δ | Type |");
        console.log("|---|---:|---:|---:|---|");
        for (const file of commit.files) {
          console.log(
            `| ${escapeMarkdownCell(file.path)} | ${file.added} | ${file.deleted} | ${file.changedLines} | ${file.binary ? "binary" : "text"} |`,
          );
        }
      }
    }
  }
}

function printReportText(report: WeeklyReport, options: PrintReportOptions): void {
  const view = options.view ?? "timeline";
  console.log(`Week starting ${report.rangeStart.toLocaleDateString()} (Monday, local time)`);

  if (report.days.length === 0) {
    console.log("\nNo work found this week.");
    return;
  }

  if (view === "by-source") {
    const sourceSeparator = "=".repeat(79);
    const daySeparator = "-".repeat(79);
    const allCommits = report.days.flatMap((day) => day.commits);
    const sourceMap = new Map<string, typeof allCommits>();
    for (const commit of allCommits) {
      const existing = sourceMap.get(commit.repoName);
      if (existing) {
        existing.push(commit);
      } else {
        sourceMap.set(commit.repoName, [commit]);
      }
    }

    const sources = [...sourceMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const [sourceName, sourceCommits] = sources[sourceIndex];
      sourceCommits.sort((a, b) => b.date.getTime() - a.date.getTime());
      const sourceTotals = computeTotals(sourceCommits);

      console.log(`\n${sourceSeparator}`);
      console.log(`[${sourceName}]`);
      console.log(
        `Source total: ${sourceTotals.commits} commits, ${sourceTotals.files} files, +${sourceTotals.added} -${sourceTotals.deleted}, ${sourceTotals.changed}, ${sourceTotals.binaries} ${sourceTotals.binaries === 1 ? "binary" : "binaries"}`,
      );
      console.log(sourceSeparator);

      const dayMap = new Map<string, typeof sourceCommits>();
      for (const commit of sourceCommits) {
        const key = toDateKey(commit.date);
        const existing = dayMap.get(key);
        if (existing) {
          existing.push(commit);
        } else {
          dayMap.set(key, [commit]);
        }
      }

      const sourceDays = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (let dayIndex = 0; dayIndex < sourceDays.length; dayIndex += 1) {
        const [dayKey, commits] = sourceDays[dayIndex];
        commits.sort((a, b) => b.date.getTime() - a.date.getTime());
        const dayTotals = computeTotals(commits);

        const dayLabel = toDayLabel(new Date(`${dayKey}T00:00:00`));
        console.log(`\n${dayLabel}`);
        console.log(formatTotalsLine("Day total: ", dayTotals));

        const timeHeader = "Time";
        const hashHeader = "Hash";
        const filesHeader = "Files";
        const addHeader = "+";
        const delHeader = "-";
        const deltaHeader = "Δ";
        const binHeader = "Bin";
        const subjectHeader = "Subject";
        const authorHeader = "Author";

        const timeWidth = Math.max(timeHeader.length, ...commits.map((commit) => toTimeLabel(commit.date).length));
        const hashWidth = Math.max(hashHeader.length, 7);
        const filesWidth = Math.max(filesHeader.length, ...commits.map((commit) => String(commit.files.length).length));
        const addWidth = Math.max(
          addHeader.length,
          ...commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.added, 0)).length),
        );
        const delWidth = Math.max(
          delHeader.length,
          ...commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.deleted, 0)).length),
        );
        const deltaWidth = Math.max(
          deltaHeader.length,
          ...commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.added + file.deleted, 0)).length),
        );
        const binWidth = Math.max(
          binHeader.length,
          ...commits.map((commit) => String(commit.files.filter((file) => file.binary).length).length),
        );

        const authorWidth = options.showAuthor
          ? Math.max(authorHeader.length, ...commits.map((commit) => commit.authorEmail.length))
          : 0;

        console.log(
          `${padRight(timeHeader, timeWidth)}  ${padRight(hashHeader, hashWidth)}${options.showAuthor ? `  ${padRight(authorHeader, authorWidth)}` : ""}  ${padLeft(filesHeader, filesWidth)}${padLeft(addHeader, addWidth)}  ${padLeft(delHeader, delWidth)}  ${padLeft(deltaHeader, deltaWidth)}  ${padLeft(binHeader, binWidth)}  ${subjectHeader}`,
        );
        console.log(
          `${"-".repeat(timeWidth)}  ${"-".repeat(hashWidth)}${options.showAuthor ? `  ${"-".repeat(authorWidth)}` : ""}  ${"-".repeat(filesWidth)}  ${"-".repeat(addWidth)}  ${"-".repeat(delWidth)}  ${"-".repeat(deltaWidth)}  ${"-".repeat(binWidth)}  ${"-".repeat(subjectHeader.length)}`,
        );

        for (const commit of commits) {
          const shortHash = commit.hash.slice(0, 7);
          const fileCount = commit.files.length;
          const addedTotal = commit.files.reduce((sum, file) => sum + file.added, 0);
          const deletedTotal = commit.files.reduce((sum, file) => sum + file.deleted, 0);
          const changedTotal = addedTotal + deletedTotal;
          const binaryCount = commit.files.filter((file) => file.binary).length;
          const authorAnnotation = options.showAuthor ? `  ${padRight(commit.authorEmail, authorWidth)}` : "";

          console.log(
            `${padRight(toTimeLabel(commit.date), timeWidth)}  ${padRight(shortHash, hashWidth)}${authorAnnotation}  ${padLeft(String(fileCount), filesWidth)}  ${padLeft(String(addedTotal), addWidth)}  ${padLeft(String(deletedTotal), delWidth)}  ${padLeft(String(changedTotal), deltaWidth)}  ${padLeft(String(binaryCount), binWidth)}  ${truncateText(commit.subject, 72)}`,
          );

          if (options.includeFiles) {
            for (const file of commit.files) {
              const binaryNote = file.binary ? " [binary]" : "";
              console.log(`  ${file.path} (+${file.added} -${file.deleted}, ${file.changedLines})${binaryNote}`);
            }
          }
        }

        if (dayIndex < sourceDays.length - 1) {
          console.log(`\n${daySeparator}`);
        }
      }

      if (sourceIndex < sources.length - 1) {
        console.log("");
      }
    }
    return;
  }

  const daySeparator = "-".repeat(79);

  for (let dayIndex = 0; dayIndex < report.days.length; dayIndex += 1) {
    const day = report.days[dayIndex];
    console.log(`\n${day.label}`);
    const dayTotals = computeTotals(day.commits);
    console.log(formatTotalsLine("Day total: ", dayTotals));

    const timeHeader = "Time";
    const sourceHeader = "Source";
    const hashHeader = "Hash";
    const filesHeader = "Files";
    const addHeader = "+";
    const delHeader = "-";
    const deltaHeader = "Δ";
    const binHeader = "Bin";
    const subjectHeader = "Subject";
    const authorHeader = "Author";

    const timeWidth = Math.max(timeHeader.length, ...day.commits.map((commit) => toTimeLabel(commit.date).length));
    const sourceWidth = Math.max(sourceHeader.length, ...day.commits.map((commit) => commit.repoName.length));
    const hashWidth = Math.max(hashHeader.length, 7);
    const filesWidth = Math.max(filesHeader.length, ...day.commits.map((commit) => String(commit.files.length).length));
    const addWidth = Math.max(
      addHeader.length,
      ...day.commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.added, 0)).length),
    );
    const delWidth = Math.max(
      delHeader.length,
      ...day.commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.deleted, 0)).length),
    );
    const deltaWidth = Math.max(
      deltaHeader.length,
      ...day.commits.map((commit) => String(commit.files.reduce((sum, file) => sum + file.added + file.deleted, 0)).length),
    );
    const binWidth = Math.max(
      binHeader.length,
      ...day.commits.map((commit) => String(commit.files.filter((file) => file.binary).length).length),
    );

    const authorWidth = options.showAuthor
      ? Math.max(authorHeader.length, ...day.commits.map((commit) => commit.authorEmail.length))
      : 0;

    console.log(
      `${padRight(timeHeader, timeWidth)}  ${padRight(sourceHeader, sourceWidth)}  ${padRight(hashHeader, hashWidth)}${options.showAuthor ? `  ${padRight(authorHeader, authorWidth)}` : ""}  ${padLeft(filesHeader, filesWidth)}${padLeft(addHeader, addWidth)}  ${padLeft(delHeader, delWidth)}  ${padLeft(deltaHeader, deltaWidth)}  ${padLeft(binHeader, binWidth)}  ${subjectHeader}`,
    );
    console.log(
      `${"-".repeat(timeWidth)}  ${"-".repeat(sourceWidth)}  ${"-".repeat(hashWidth)}${options.showAuthor ? `  ${"-".repeat(authorWidth)}` : ""}  ${"-".repeat(filesWidth)}  ${"-".repeat(addWidth)}  ${"-".repeat(delWidth)}  ${"-".repeat(deltaWidth)}  ${"-".repeat(binWidth)}  ${"-".repeat(subjectHeader.length)}`,
    );

    for (const commit of day.commits) {
      const shortHash = commit.hash.slice(0, 7);
      const fileCount = commit.files.length;
      const addedTotal = commit.files.reduce((sum, file) => sum + file.added, 0);
      const deletedTotal = commit.files.reduce((sum, file) => sum + file.deleted, 0);
      const changedTotal = addedTotal + deletedTotal;
      const binaryCount = commit.files.filter((file) => file.binary).length;
      const authorAnnotation = options.showAuthor ? `  ${padRight(commit.authorEmail, authorWidth)}` : "";

      console.log(
        `${padRight(toTimeLabel(commit.date), timeWidth)}  ${padRight(commit.repoName, sourceWidth)}  ${padRight(shortHash, hashWidth)}${authorAnnotation}  ${padLeft(String(fileCount), filesWidth)}  ${padLeft(String(addedTotal), addWidth)}  ${padLeft(String(deletedTotal), delWidth)}  ${padLeft(String(changedTotal), deltaWidth)}  ${padLeft(String(binaryCount), binWidth)}  ${truncateText(commit.subject, 72)}`,
      );
      if (options.includeFiles) {
        for (const file of commit.files) {
          const binaryNote = file.binary ? " [binary]" : "";
          console.log(`  ${file.path} (+${file.added} -${file.deleted}, ${file.changedLines})${binaryNote}`);
        }
      }
    }

    if (dayIndex < report.days.length - 1) {
      console.log(`\n${daySeparator}`);
    }
  }
}

export function printReport(report: WeeklyReport, options: PrintReportOptions = {}): void {
  const format = options.format ?? "text";
  if (format === "markdown") {
    printReportMarkdown(report, options);
    return;
  }
  printReportText(report, options);
}
