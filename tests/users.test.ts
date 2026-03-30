import { describe, expect, it } from "bun:test";
import { addUser, listUsers, removeUser, validateEmail } from "../src/core/users";
import type { ConfigFile } from "../src/types";

const baseConfig: ConfigFile = { version: 1, sources: [] };

describe("validateEmail", () => {
  it("accepts a standard email address", () => {
    expect(() => validateEmail("dev@example.com")).not.toThrow();
  });

  it("accepts an email with subdomains", () => {
    expect(() => validateEmail("dev@mail.example.com")).not.toThrow();
  });

  it("rejects a string without @", () => {
    expect(() => validateEmail("notanemail")).toThrow("invalid email address");
  });

  it("rejects a string with @ but no domain", () => {
    expect(() => validateEmail("dev@")).toThrow("invalid email address");
  });

  it("rejects an empty string", () => {
    expect(() => validateEmail("")).toThrow("invalid email address");
  });
});

describe("listUsers", () => {
  it("returns empty array when users field is absent", () => {
    expect(listUsers(baseConfig)).toEqual([]);
  });

  it("returns empty array when users field is empty array", () => {
    expect(listUsers({ ...baseConfig, users: [] })).toEqual([]);
  });

  it("returns configured users", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com", "bob@x.com"] };
    expect(listUsers(config)).toEqual(["alice@x.com", "bob@x.com"]);
  });
});

describe("addUser", () => {
  it("adds a valid email to a config with no users", () => {
    const updated = addUser(baseConfig, "alice@x.com");
    expect(updated.users).toEqual(["alice@x.com"]);
  });

  it("appends a new email to an existing list", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com"] };
    const updated = addUser(config, "bob@x.com");
    expect(updated.users).toEqual(["alice@x.com", "bob@x.com"]);
  });

  it("is idempotent — same email is not added twice", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com"] };
    const updated = addUser(config, "alice@x.com");
    expect(updated.users).toEqual(["alice@x.com"]);
    expect(updated).toBe(config);
  });

  it("deduplicates case-insensitively", () => {
    const config: ConfigFile = { ...baseConfig, users: ["Alice@X.com"] };
    const updated = addUser(config, "alice@x.com");
    expect(updated).toBe(config);
  });

  it("trims whitespace from the email before storing", () => {
    const updated = addUser(baseConfig, "  alice@x.com  ");
    expect(updated.users).toEqual(["alice@x.com"]);
  });

  it("throws on an invalid email", () => {
    expect(() => addUser(baseConfig, "notanemail")).toThrow("invalid email address");
  });

  it("does not mutate the original config", () => {
    addUser(baseConfig, "alice@x.com");
    expect(baseConfig.users).toBeUndefined();
  });
});

describe("removeUser", () => {
  it("removes a present email", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com", "bob@x.com"] };
    const updated = removeUser(config, "alice@x.com");
    expect(updated.users).toEqual(["bob@x.com"]);
  });

  it("is a no-op when the email is not in the list", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com"] };
    const updated = removeUser(config, "bob@x.com");
    expect(updated).toBe(config);
  });

  it("removes case-insensitively", () => {
    const config: ConfigFile = { ...baseConfig, users: ["Alice@X.com"] };
    const updated = removeUser(config, "alice@x.com");
    expect(updated.users).toBeUndefined();
  });

  it("removes the users field entirely when the last email is removed", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com"] };
    const updated = removeUser(config, "alice@x.com");
    expect(updated.users).toBeUndefined();
  });

  it("is a no-op on a config with no users field", () => {
    const updated = removeUser(baseConfig, "alice@x.com");
    expect(updated).toBe(baseConfig);
  });

  it("does not mutate the original config", () => {
    const config: ConfigFile = { ...baseConfig, users: ["alice@x.com"] };
    removeUser(config, "alice@x.com");
    expect(config.users).toEqual(["alice@x.com"]);
  });
});
