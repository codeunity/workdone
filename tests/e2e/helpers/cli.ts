import { spawnSync } from "node:child_process";

export interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

export function runCli(args: string[], env?: Record<string, string>): CliResult {
  const result = spawnSync("bun", ["run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    // Force UTC so time-based output is consistent across timezones in snapshots.
    env: { ...process.env, TZ: "UTC", ...env },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}
