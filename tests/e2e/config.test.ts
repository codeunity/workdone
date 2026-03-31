import { describe, expect, it, afterEach } from "bun:test";
import { createConfig, configEnv } from "./helpers/config";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("workdone config", () => {
  it("exits 0 and prints a path ending with config.json", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;

    const { runCli } = await import("./helpers/cli");
    const result = runCli(["config"], configEnv(cfg.configPath));

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/config\.json$/);
  });

  it("honours WORKDONE_CONFIG_PATH in reported path", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;

    const { runCli } = await import("./helpers/cli");
    const result = runCli(["config"], configEnv(cfg.configPath));

    expect(result.stdout.trim()).toBe(cfg.configPath);
  });
});
