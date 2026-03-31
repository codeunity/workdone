import { describe, expect, it, afterEach } from "bun:test";
import { createConfig, configEnv } from "./helpers/config";
import { runCli } from "./helpers/cli";
import os from "node:os";
import path from "node:path";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("error cases", () => {
  it("exits 1 for an unknown command", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const result = runCli(["notacommand"], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });

  it("exits 1 for --week with an invalid value", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const result = runCli(["report", "--week", "notanumber"], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });

  it("exits 1 for --since without --until when paired incorrectly", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const result = runCli(["report", "--until", "2026-03-20"], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });

  it("exits 1 for sources add with a non-git path", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const nonGitPath = path.join(os.tmpdir(), "definitely-not-a-git-repo-" + Date.now());
    const result = runCli(["sources", "add", nonGitPath], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });

  it("exits 1 for report --week and --since combined", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const result = runCli(["report", "--week", "-1", "--since", "2026-03-01"], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });
});
