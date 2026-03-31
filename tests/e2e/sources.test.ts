import { describe, expect, it, beforeAll, afterAll, afterEach } from "bun:test";
import { setupFixtures, ALICE } from "./helpers/fixtures";
import type { Fixtures } from "./helpers/fixtures";
import { createConfig, configEnv } from "./helpers/config";
import { runCli } from "./helpers/cli";

let fixtures: Fixtures;

beforeAll(async () => {
  fixtures = await setupFixtures();
});

afterAll(async () => {
  await fixtures.teardown();
});

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("workdone sources", () => {
  it("sources list is empty on a fresh config", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;

    const result = runCli(["sources", "list"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No sources");
  });

  it("sources add registers a valid git repo and exits 0", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;

    const result = runCli(
      ["sources", "add", fixtures.repoSingle, "--name", "my-repo"],
      configEnv(cfg.configPath),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("my-repo");
  });

  it("sources list shows added source", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const env = configEnv(cfg.configPath);

    runCli(["sources", "add", fixtures.repoSingle, "--name", "listed-repo"], env);
    const result = runCli(["sources", "list"], env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("listed-repo");
  });

  it("sources remove removes an existing source and exits 0", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;
    const env = configEnv(cfg.configPath);

    runCli(["sources", "add", fixtures.repoSingle, "--name", "to-remove"], env);
    const removeResult = runCli(["sources", "remove", "to-remove"], env);
    expect(removeResult.status).toBe(0);

    const listResult = runCli(["sources", "list"], env);
    expect(listResult.stdout).not.toContain("to-remove");
  });

  it("sources validate exits 0 for a valid git repo", async () => {
    const cfg = await createConfig([
      { type: "git-local", path: fixtures.repoSingle, name: "valid-repo" },
    ]);
    cleanup = cfg.cleanup;

    const result = runCli(["sources", "validate"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("valid-repo");
  });

  it("sources validate exits 1 for a non-existent path", async () => {
    const cfg = await createConfig([
      { type: "git-local", path: "/tmp/nonexistent-workdone-e2e-path", name: "bad-repo" },
    ]);
    cleanup = cfg.cleanup;

    const result = runCli(["sources", "validate"], configEnv(cfg.configPath));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("bad-repo");
  });
});
