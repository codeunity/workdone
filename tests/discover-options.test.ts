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

describe("sources select option validation", () => {
  it("fails on non-integer max-depth", () => {
    const result = runCli(["sources", "select", ".", "--max-depth", "abc"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("invalid value for '--max-depth': must be a non-negative integer");
  });

  it("fails on negative max-depth", () => {
    const result = runCli(["sources", "select", ".", "--max-depth", "-1"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("invalid value for '--max-depth': must be a non-negative integer");
  });

  it("fails without an interactive terminal", () => {
    const result = runCli(["sources", "select", "."]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("interactive terminal");
  });
});
