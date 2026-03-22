import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

function runCli(args: string[]): string {
  const result = spawnSync("bun", ["run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return output;
}

describe("help output", () => {
  it("includes config command in top-level help", () => {
    const output = runCli(["--help"]);
    expect(output).toContain("config                 Print config file location");
    expect(output).toContain("report                 Print your current week's report (use --source, --view, and --format)");
    expect(output).toContain("sync                   Fetch all remotes for registered sources before reporting across machines");
  });

  it("supports help config topic", () => {
    const output = runCli(["help", "config"]);
    expect(output).toContain("USAGE");
    expect(output).toContain("workdone config [options]");
  });

  it("supports sources discover help topic", () => {
    const output = runCli(["help", "sources", "discover"]);
    expect(output).toContain("workdone sources discover <folder> [options]");
    expect(output).toContain("--max-depth <n>");
    expect(output).toContain("--dry-run");
  });

  it("shows source option in report help", () => {
    const output = runCli(["help", "report"]);
    expect(output).toContain("-s, --source <source>  Limit report to one source (alias or path)");
    expect(output).toContain("-f, --files            Include per-file changes");
    expect(output).toContain("-V, --view <view>      Report layout: timeline | by-source (default: timeline)");
    expect(output).toContain("-F, --format <format>  Output format: text | markdown (default: text)");
    expect(output).toContain("git config --global user.email");
    expect(output).toContain("local branches and remote-tracking");
  });

  it("supports sync help topic", () => {
    const output = runCli(["help", "sync"]);
    expect(output).toContain("workdone sync [options]");
    expect(output).toContain("git fetch --all --prune");
    expect(output).toContain("-s, --source <source>  Sync one source by alias or path");
  });
});
