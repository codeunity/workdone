import { describe, expect, it, beforeAll, afterAll, afterEach } from "bun:test";
import { setupFixtures, ALICE, BOB, dateString } from "./helpers/fixtures";
import type { Fixtures } from "./helpers/fixtures";
import { createConfig, configEnv } from "./helpers/config";
import { runCli } from "./helpers/cli";
import type { Source } from "../../src/types";

let fixtures: Fixtures;

beforeAll(async () => {
  fixtures = await setupFixtures();
});

afterAll(async () => {
  await fixtures.teardown();
});

function singleSource(): Source[] {
  return [{ type: "git-local", path: fixtures.repoSingle, name: "repo-single" }];
}

function multiSource(): Source[] {
  return [{ type: "git-local", path: fixtures.repoMulti, name: "repo-multi" }];
}

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("workdone report", () => {
  it("exits 0 with no sources registered and prints no-sources message", async () => {
    const cfg = await createConfig([]);
    cleanup = cfg.cleanup;

    const result = runCli(["report"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No sources registered");
  });

  it("default timeline text view matches snapshot", async () => {
    const cfg = await createConfig(singleSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("by-source view matches snapshot", async () => {
    const cfg = await createConfig(singleSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--view", "by-source"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("markdown format matches snapshot", async () => {
    const cfg = await createConfig(singleSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--format", "markdown"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("--files flag matches snapshot", async () => {
    const cfg = await createConfig(singleSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--files"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("multi-user report includes Author column and both users' commits", async () => {
    const cfg = await createConfig(multiSource(), [ALICE, BOB]);
    cleanup = cfg.cleanup;

    const result = runCli(["report"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(ALICE);
    expect(result.stdout).toContain(BOB);
    expect(result.stdout).toContain("Author");
    expect(result.stdout).toMatchSnapshot();
  });

  it("--source flag limits output to the named source", async () => {
    const cfg = await createConfig([...singleSource(), ...multiSource()], [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--source", "repo-single"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("repo-multi");
  });

  it("empty repo produces no-work message", async () => {
    const cfg = await createConfig(
      [{ type: "git-local", path: fixtures.repoEmpty, name: "repo-empty" }],
      [ALICE],
    );
    cleanup = cfg.cleanup;

    const result = runCli(["report"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No work found");
  });
});

describe("workdone report date-range options", () => {
  function dateRangeSource(): Source[] {
    return [{ type: "git-local", path: fixtures.repoDateRange, name: "repo-daterange" }];
  }

  it("--today shows today's commit and not yesterday's", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--today"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("todays work");
    expect(result.stdout).not.toContain("yesterdays work");
  });

  it("--yesterday shows yesterday's commit and not today's", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--yesterday"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("yesterdays work");
    expect(result.stdout).not.toContain("todays work");
  });

  it("--this-month includes commits from this month", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--this-month"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("todays work");
    expect(result.stdout).not.toContain("last month work");
  });

  it("--last-month includes last month's commit and not this month's", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--last-month"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("last month work");
    expect(result.stdout).not.toContain("todays work");
  });

  it("--since includes commits from that date onward", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    // since yesterday: should include yesterday + today, not last month
    const since = dateString(-1);
    const result = runCli(["report", "--since", since], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("yesterdays work");
    expect(result.stdout).toContain("todays work");
    expect(result.stdout).not.toContain("last month work");
  });

  it("--since + --until shows only commits within the range", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    // range: yesterday only
    const since = dateString(-1);
    const until = dateString(-1);
    const result = runCli(["report", "--since", since, "--until", until], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("yesterdays work");
    expect(result.stdout).not.toContain("todays work");
    expect(result.stdout).not.toContain("last month work");
  });

  it("--week=-1 shows last week's commit and not this week's", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--week=-1"], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("last week work");
    expect(result.stdout).not.toContain("todays work");
  });

  it("--since exit code is 0 for a valid date", async () => {
    const cfg = await createConfig(dateRangeSource(), [ALICE]);
    cleanup = cfg.cleanup;

    const result = runCli(["report", "--since", dateString(-7)], configEnv(cfg.configPath));
    expect(result.status).toBe(0);
  });
});
