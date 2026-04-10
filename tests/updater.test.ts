import { describe, expect, it } from "bun:test";
import { detectAssetName, fetchLatestVersion, isNewerVersion } from "../src/core/updater";
import type { Fetcher } from "../src/core/updater";

// ---------------------------------------------------------------------------
// fetchLatestVersion
// ---------------------------------------------------------------------------

function makeFetcher(status: number, body: unknown): Fetcher {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function makeFailingFetcher(message: string): Fetcher {
  return async () => {
    throw new Error(message);
  };
}

describe("fetchLatestVersion", () => {
  it("returns the version string from a successful response", async () => {
    const fetcher = makeFetcher(200, { tag_name: "v1.2.3" });
    expect(await fetchLatestVersion(fetcher)).toBe("1.2.3");
  });

  it("strips a leading v from the tag_name", async () => {
    const fetcher = makeFetcher(200, { tag_name: "v0.9.0" });
    expect(await fetchLatestVersion(fetcher)).toBe("0.9.0");
  });

  it("returns a version without a v prefix unchanged", async () => {
    const fetcher = makeFetcher(200, { tag_name: "2.0.0" });
    expect(await fetchLatestVersion(fetcher)).toBe("2.0.0");
  });

  it("throws when the API returns a non-200 status", async () => {
    const fetcher = makeFetcher(404, { message: "Not Found" });
    await expect(fetchLatestVersion(fetcher)).rejects.toThrow("404");
  });

  it("throws when the response body has no tag_name", async () => {
    const fetcher = makeFetcher(200, { name: "Latest" });
    await expect(fetchLatestVersion(fetcher)).rejects.toThrow("tag_name");
  });

  it("throws when tag_name is an empty string", async () => {
    const fetcher = makeFetcher(200, { tag_name: "" });
    await expect(fetchLatestVersion(fetcher)).rejects.toThrow("tag_name");
  });

  it("wraps a network error with a descriptive message", async () => {
    const fetcher = makeFailingFetcher("ECONNREFUSED");
    await expect(fetchLatestVersion(fetcher)).rejects.toThrow("network error");
  });
});

// ---------------------------------------------------------------------------
// isNewerVersion
// ---------------------------------------------------------------------------

describe("isNewerVersion", () => {
  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns true when latest has a higher patch", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns true when latest has a higher minor", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest has a higher major", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when installed is ahead of latest", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles v-prefixes on both sides", () => {
    expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true);
  });

  it("handles a v-prefix on current only", () => {
    expect(isNewerVersion("v0.9.0", "0.10.0")).toBe(true);
  });

  it("handles a v-prefix on latest only", () => {
    expect(isNewerVersion("0.9.0", "v0.10.0")).toBe(true);
  });

  it("correctly compares multi-digit minor versions (10 > 9)", () => {
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(true);
  });

  it("returns false for 0.10.0 vs 0.9.0 (installed is ahead)", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectAssetName
// ---------------------------------------------------------------------------

describe("detectAssetName", () => {
  it("returns the Windows x64 asset name", () => {
    expect(detectAssetName("win32", "x64")).toBe("workdone-windows-x64.exe");
  });

  it("returns the macOS arm64 asset name", () => {
    expect(detectAssetName("darwin", "arm64")).toBe("workdone-darwin-arm64");
  });

  it("throws for an unsupported platform", () => {
    expect(() => detectAssetName("linux", "x64")).toThrow("unsupported platform");
  });

  it("throws for an unsupported arch on a known OS", () => {
    expect(() => detectAssetName("win32", "arm64")).toThrow("unsupported platform");
  });
});
