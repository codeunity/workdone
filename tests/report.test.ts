import { describe, expect, it } from "bun:test";
import { filterCommitsByAuthorEmail } from "../src/core/report";

describe("report author filter", () => {
  it("keeps only commits from matching author email", () => {
    const commits = [
      { authorEmail: "dev@example.com", hash: "a" },
      { authorEmail: "other@example.com", hash: "b" },
      { authorEmail: "DEV@example.com", hash: "c" },
    ];

    const filtered = filterCommitsByAuthorEmail(commits, "dev@example.com");
    expect(filtered).toHaveLength(2);
    expect(filtered.map((commit) => commit.hash)).toEqual(["a", "c"]);
  });
});
