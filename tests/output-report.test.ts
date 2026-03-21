import { describe, expect, it, mock } from "bun:test";
import { printReport } from "../src/core/output";
import type { WeeklyReport } from "../src/types";

function sampleReport(): WeeklyReport {
  return {
    weekStart: new Date("2026-03-16T00:00:00"),
    generatedAt: new Date("2026-03-19T15:00:00"),
    days: [
      {
        dateKey: "2026-03-19",
        label: "2026-03-19 (Thu)",
        commits: [
          {
            repoPath: "/tmp/repo",
            repoName: "api",
            hash: "a1b2c3d4",
            authorEmail: "dev@example.com",
            date: new Date("2026-03-19T14:22:00"),
            subject: "Calibrate lunar sensor matrix",
            files: [
              {
                path: "src/index.ts",
                added: 3,
                deleted: 1,
                changedLines: 4,
                binary: false,
              },
              {
                path: "assets/logo.png",
                added: 0,
                deleted: 0,
                changedLines: 0,
                binary: true,
              },
            ],
          },
        ],
      },
      {
        dateKey: "2026-03-18",
        label: "2026-03-18 (Wed)",
        commits: [
          {
            repoPath: "/tmp/repo",
            repoName: "api",
            hash: "b5c6d7e8",
            authorEmail: "dev@example.com",
            date: new Date("2026-03-18T09:10:00"),
            subject:
              "Archive nebula telemetry for interstellar quality benchmarking across all orbital simulation suites",
            files: [],
          },
        ],
      },
    ],
  };
}

describe("report output options", () => {
  it("omits file rows by default when files are not requested", () => {
    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      printReport(sampleReport(), { includeFiles: false, view: "timeline" });
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Day total: 1 commits, 2 files, +3 -1, 4, 1 binary");
    expect(output).toContain("Time");
    expect(output).toContain("Source");
    expect(output).toContain("Hash");
    expect(output).toContain("Files");
    expect(output).toContain("Subject");
    expect(output).toContain("14:22  api");
    expect(output).toContain("2026-03-18 (Wed)");
    expect(output).toContain("-------------------------------------------------------------------------------");
    expect(output).toContain("Archive nebula telemetry for interstellar quality benchmarking across al...");
    expect(output).not.toContain("src/index.ts");
  });

  it("includes file rows when files are requested", () => {
    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      printReport(sampleReport(), { includeFiles: true, view: "timeline" });
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Day total: 1 commits, 2 files, +3 -1, 4, 1 binary");
    expect(output).toContain("14:22  api");
    expect(output).toContain("src/index.ts");
  });

  it("renders by-source view sections", () => {
    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      printReport(sampleReport(), { includeFiles: false, view: "by-source" });
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("[api]");
    const sourceIndex = output.indexOf("[api]");
    const dayIndex = output.indexOf("2026-03-19 (Thu)");
    expect(sourceIndex).toBeLessThan(dayIndex);
    expect(output).toContain("Source total:");
    expect(output).toContain("Day total:");
    expect(output).toContain("===============================================================================");
    expect(output).toContain("Time");
    expect(output).toContain("Hash");
    expect(output).toContain("Subject");
  });

  it("renders markdown timeline output", () => {
    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      printReport(sampleReport(), { includeFiles: false, view: "timeline", format: "markdown" });
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("# Workdone Report");
    expect(output).toContain("## 2026-03-19 (Thu)");
    expect(output).toContain("| Time | Source | Hash | Files | + | - | Δ | Bin | Subject |");
    expect(output).toContain("| 14:22 | api | a1b2c3d | 2 | 3 | 1 | 4 | 1 | Calibrate lunar sensor matrix |");
  });

  it("renders markdown by-source output with file tables", () => {
    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      printReport(sampleReport(), { includeFiles: true, view: "by-source", format: "markdown" });
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("## api");
    expect(output).toContain("### 2026-03-19 (Thu)");
    expect(output).toContain("| Time | Hash | Files | + | - | Δ | Bin | Subject |");
    expect(output).toContain("#### a1b2c3d files");
    expect(output).toContain("| Path | + | - | Δ | Type |");
    expect(output).toContain("| src/index.ts | 3 | 1 | 4 | text |");
    expect(output).toContain("| assets/logo.png | 0 | 0 | 0 | binary |");
  });
});
