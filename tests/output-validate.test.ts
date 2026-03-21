import { describe, expect, it, mock } from "bun:test";
import { printValidationResults } from "../src/core/output";
import type { ValidationResult } from "../src/types";

describe("validation output formatting", () => {
  it("prints aligned table columns and summary", () => {
    const results: ValidationResult[] = [
      {
        source: { type: "git-local", name: "api", path: "C:/repos/api" },
        valid: true,
      },
      {
        source: { type: "git-local", name: "legacy", path: "C:/repos/legacy" },
        valid: false,
        reason: "not_git_repo",
      },
    ];

    const logSpy = mock(() => {});
    const original = console.log;
    console.log = logSpy as typeof console.log;

    try {
      const invalidCount = printValidationResults(results);
      expect(invalidCount).toBe(1);
    } finally {
      console.log = original;
    }

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Status");
    expect(output).toContain("Name");
    expect(output).toContain("Type");
    expect(output).toContain("Path");
    expect(output).toContain("Reason");
    expect(output).toContain("VALID");
    expect(output).toContain("INVALID");
    expect(output).toContain("path is not a git repository");
    expect(output).toContain("1 valid, 1 invalid");
  });
});
