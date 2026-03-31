import { describe, expect, it } from "bun:test";
import { dedupeCommitsByHash, filterCommitsByAuthorEmail } from "../src/core/report";

describe("report author filter", () => {
  it("keeps only commits matching a single email in the array", () => {
    const commits = [
      { authorEmail: "dev@example.com", hash: "a" },
      { authorEmail: "other@example.com", hash: "b" },
      { authorEmail: "DEV@example.com", hash: "c" },
    ];

    const filtered = filterCommitsByAuthorEmail(commits, ["dev@example.com"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((commit) => commit.hash)).toEqual(["a", "c"]);
  });

  it("keeps commits matching any email in a multi-email array (OR logic)", () => {
    const commits = [
      { authorEmail: "alice@example.com", hash: "a" },
      { authorEmail: "bob@example.com", hash: "b" },
      { authorEmail: "carol@example.com", hash: "c" },
    ];

    const filtered = filterCommitsByAuthorEmail(commits, ["alice@example.com", "bob@example.com"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((commit) => commit.hash)).toEqual(["a", "b"]);
  });

  it("returns no commits for an empty email array", () => {
    const commits = [
      { authorEmail: "dev@example.com", hash: "a" },
    ];
    expect(filterCommitsByAuthorEmail(commits, [])).toHaveLength(0);
  });

  it("matches case-insensitively across all emails in the array", () => {
    const commits = [
      { authorEmail: "Alice@Example.COM", hash: "a" },
      { authorEmail: "BOB@EXAMPLE.COM", hash: "b" },
    ];
    const filtered = filterCommitsByAuthorEmail(commits, ["alice@example.com", "bob@example.com"]);
    expect(filtered).toHaveLength(2);
  });

  it("deduplicates commits by exact hash", () => {
    const commits = [
      {
        repoPath: "/tmp/repo",
        repoName: "repo",
        hash: "abc123",
        authorEmail: "dev@example.com",
        date: new Date("2026-03-19T10:00:00Z"),
        subject: "First copy",
        files: [],
      },
      {
        repoPath: "/tmp/repo",
        repoName: "repo",
        hash: "abc123",
        authorEmail: "dev@example.com",
        date: new Date("2026-03-19T10:00:00Z"),
        subject: "Duplicate copy",
        files: [],
      },
      {
        repoPath: "/tmp/repo",
        repoName: "repo",
        hash: "def456",
        authorEmail: "dev@example.com",
        date: new Date("2026-03-19T11:00:00Z"),
        subject: "Unique copy",
        files: [],
      },
    ];

    const deduped = dedupeCommitsByHash(commits);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((commit) => commit.hash)).toEqual(["abc123", "def456"]);
  });
});

