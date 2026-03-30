import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

function runCli(args: string[]): { output: string; status: number | null } {
  const result = spawnSync("bun", ["run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status,
  };
}

describe("report date-range option validation", () => {
  it("fails when --week and --since are combined", () => {
    const result = runCli(["report", "--week=-1", "--since", "2026-03-20"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("--week and --since cannot be used together");
  });

  it("fails when --week and --until are combined", () => {
    const result = runCli(["report", "--week=-1", "--until", "2026-03-30"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("--week and --until cannot be used together");
  });

  it("fails when --until is used without --since", () => {
    const result = runCli(["report", "--until", "2026-03-30"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("--until requires --since");
  });

  it("fails on invalid --week value", () => {
    const result = runCli(["report", "--week", "abc"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("--week");
  });

  it("fails on out-of-range --week value", () => {
    const result = runCli(["report", "--week", "99"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("week number");
  });

  it("fails on malformed --since date", () => {
    const result = runCli(["report", "--since", "20-3-2026"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("YYYY-MM-DD");
  });

  it("fails on malformed --until date", () => {
    const result = runCli(["report", "--since", "2026-03-20", "--until", "30-3-2026"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("YYYY-MM-DD");
  });

  it("fails on impossible --since date", () => {
    const result = runCli(["report", "--since", "2026-02-30"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("real calendar date");
  });
});

describe("report shortcut option validation", () => {
  it("fails when --today and --yesterday are combined", () => {
    const result = runCli(["report", "--today", "--yesterday"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("cannot be used together");
  });

  it("fails when --today and --week are combined", () => {
    const result = runCli(["report", "--today", "--week=-1"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("cannot be used together");
  });

  it("fails when --this-month and --since are combined", () => {
    const result = runCli(["report", "--this-month", "--since", "2026-03-01"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("cannot be used together");
  });

  it("fails when --last-month and --until are combined", () => {
    const result = runCli(["report", "--last-month", "--until", "2026-03-31"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("cannot be used together");
  });
});
