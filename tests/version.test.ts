import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { VERSION } from "../src/core/version";
import pkg from "../package.json";

describe("version module", () => {
  it("exports a plain semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches package.json version", () => {
    expect(VERSION).toBe(pkg.version);
  });
});

describe("CLI --version output", () => {
  function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
    const result = spawnSync("bun", ["run", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      status: result.status,
    };
  }

  it("prints plain semver with --version", () => {
    const { stdout } = runCli(["--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints exact package.json version with --version", () => {
    const { stdout } = runCli(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("prints plain semver with -v alias", () => {
    const { stdout } = runCli(["-v"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--version output contains no extra text or prefix", () => {
    const { stdout } = runCli(["--version"]);
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/^v\d/);
  });
});
