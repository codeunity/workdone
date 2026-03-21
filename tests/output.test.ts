import { describe, expect, it } from "bun:test";
import { formatValidationReason } from "../src/core/output";

describe("output utilities", () => {
  it("maps validation reasons to text", () => {
    expect(formatValidationReason("missing")).toBe("path does not exist");
    expect(formatValidationReason("not_directory")).toBe("path is not a directory");
    expect(formatValidationReason("not_git_repo")).toBe("path is not a git repository");
    expect(formatValidationReason("not_accessible")).toBe("path is not accessible");
  });
});
