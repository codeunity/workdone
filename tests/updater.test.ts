import { describe, expect, it } from "bun:test";
import {
  buildDownloadUrls,
  cleanupStaleBinary,
  detectAssetName,
  downloadAndVerify,
  fetchLatestVersion,
  isNewerVersion,
  replaceBinary,
} from "../src/core/updater";
import type { Fetcher, FileOps } from "../src/core/updater";

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

// ---------------------------------------------------------------------------
// buildDownloadUrls
// ---------------------------------------------------------------------------

describe("buildDownloadUrls", () => {
  it("builds correct URLs from a bare version string", () => {
    const { binaryUrl, checksumUrl } = buildDownloadUrls("1.2.3", "workdone-windows-x64.exe");
    expect(binaryUrl).toBe(
      "https://github.com/codeunity/workdone/releases/download/v1.2.3/workdone-windows-x64.exe",
    );
    expect(checksumUrl).toBe(
      "https://github.com/codeunity/workdone/releases/download/v1.2.3/workdone-windows-x64.exe.sha256",
    );
  });

  it("does not double-prefix v when version already starts with v", () => {
    const { binaryUrl } = buildDownloadUrls("v1.2.3", "workdone-darwin-arm64");
    expect(binaryUrl).toContain("/download/v1.2.3/");
    expect(binaryUrl).not.toContain("/download/vv");
  });

  it("builds correct macOS arm64 URLs", () => {
    const { binaryUrl, checksumUrl } = buildDownloadUrls("0.9.0", "workdone-darwin-arm64");
    expect(binaryUrl).toBe(
      "https://github.com/codeunity/workdone/releases/download/v0.9.0/workdone-darwin-arm64",
    );
    expect(checksumUrl).toBe(
      "https://github.com/codeunity/workdone/releases/download/v0.9.0/workdone-darwin-arm64.sha256",
    );
  });
});

// ---------------------------------------------------------------------------
// downloadAndVerify
// ---------------------------------------------------------------------------

async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeBinaryFetcher(binaryData: Uint8Array, correctHash: string): Fetcher {
  return async (url: string) => {
    if (url.endsWith(".sha256")) {
      return new Response(`${correctHash}  workdone-windows-x64.exe\n`);
    }
    return new Response(binaryData.buffer as ArrayBuffer);
  };
}

describe("downloadAndVerify", () => {
  it("resolves with binary data when checksum matches", async () => {
    const binaryData = new TextEncoder().encode("fake binary payload");
    const correctHash = await computeSha256Hex(binaryData);
    const fetcher = makeBinaryFetcher(binaryData, correctHash);

    const result = await downloadAndVerify(
      fetcher,
      "https://example.com/workdone-windows-x64.exe",
      "https://example.com/workdone-windows-x64.exe.sha256",
    );
    expect(result).toEqual(binaryData);
  });

  it("throws when the checksum does not match", async () => {
    const binaryData = new TextEncoder().encode("some binary");
    const fetcher = makeBinaryFetcher(binaryData, "deadbeef".repeat(8));

    await expect(
      downloadAndVerify(
        fetcher,
        "https://example.com/workdone-windows-x64.exe",
        "https://example.com/workdone-windows-x64.exe.sha256",
      ),
    ).rejects.toThrow("checksum verification failed");
  });

  it("throws when binary download returns a non-200 status", async () => {
    const fetcher: Fetcher = async () => new Response("Not Found", { status: 404 });

    await expect(
      downloadAndVerify(
        fetcher,
        "https://example.com/workdone-windows-x64.exe",
        "https://example.com/workdone-windows-x64.exe.sha256",
      ),
    ).rejects.toThrow("HTTP 404");
  });

  it("throws when binary download fails with a network error", async () => {
    const fetcher: Fetcher = async () => {
      throw new Error("ECONNREFUSED");
    };

    await expect(
      downloadAndVerify(
        fetcher,
        "https://example.com/workdone-windows-x64.exe",
        "https://example.com/workdone-windows-x64.exe.sha256",
      ),
    ).rejects.toThrow("failed to download binary");
  });

  it("throws when checksum download returns a non-200 status", async () => {
    const binaryData = new TextEncoder().encode("binary content");
    let calls = 0;
    const fetcher: Fetcher = async () => {
      calls += 1;
      if (calls === 1) return new Response(binaryData.buffer as ArrayBuffer);
      return new Response("Not Found", { status: 404 });
    };

    await expect(
      downloadAndVerify(
        fetcher,
        "https://example.com/workdone-windows-x64.exe",
        "https://example.com/workdone-windows-x64.exe.sha256",
      ),
    ).rejects.toThrow("failed to download checksum");
  });

  it("throws when the checksum file is empty", async () => {
    const binaryData = new TextEncoder().encode("binary content");
    const fetcher: Fetcher = async (url) => {
      if (url.endsWith(".sha256")) return new Response("   ");
      return new Response(binaryData.buffer as ArrayBuffer);
    };

    await expect(
      downloadAndVerify(
        fetcher,
        "https://example.com/workdone-windows-x64.exe",
        "https://example.com/workdone-windows-x64.exe.sha256",
      ),
    ).rejects.toThrow("checksum file was empty");
  });
});

// ---------------------------------------------------------------------------
// replaceBinary
// ---------------------------------------------------------------------------

function makeFileOps(opts?: { unlinkShouldFail?: boolean }): {
  ops: FileOps;
  written: Map<string, Uint8Array>;
  renamed: Array<[string, string]>;
  deleted: string[];
  chmods: Array<[string, number]>;
} {
  const written = new Map<string, Uint8Array>();
  const renamed: Array<[string, string]> = [];
  const deleted: string[] = [];
  const chmods: Array<[string, number]> = [];

  const ops: FileOps = {
    writeFile: async (p, data) => {
      written.set(p, data);
    },
    rename: async (src, dst) => {
      renamed.push([src, dst]);
    },
    unlink: async (p) => {
      if (opts?.unlinkShouldFail) throw new Error("file is locked");
      deleted.push(p);
    },
    chmod: async (p, mode) => {
      chmods.push([p, mode]);
    },
  };

  return { ops, written, renamed, deleted, chmods };
}

describe("replaceBinary — Windows", () => {
  const binaryData = new TextEncoder().encode("new binary content");
  const currentPath = "C:\\Users\\user\\.workdone\\bin\\workdone.exe";
  const expectedOldPath = "C:\\Users\\user\\.workdone\\bin\\workdone.old.exe";

  it("renames the old binary and writes the new one", async () => {
    const { ops, written, renamed } = makeFileOps();
    await replaceBinary(currentPath, binaryData, "win32", ops);

    expect(renamed).toEqual([[currentPath, expectedOldPath]]);
    expect(written.get(currentPath)).toEqual(binaryData);
  });

  it("deletes the renamed old binary after a successful write", async () => {
    const { ops, deleted } = makeFileOps();
    await replaceBinary(currentPath, binaryData, "win32", ops);

    expect(deleted).toContain(expectedOldPath);
  });

  it("does not throw when unlink of the old binary fails", async () => {
    const { ops } = makeFileOps({ unlinkShouldFail: true });
    await expect(replaceBinary(currentPath, binaryData, "win32", ops)).resolves.toBeUndefined();
  });

  it("still writes the new binary even when unlink fails", async () => {
    const { ops, written } = makeFileOps({ unlinkShouldFail: true });
    await replaceBinary(currentPath, binaryData, "win32", ops);

    expect(written.get(currentPath)).toEqual(binaryData);
  });
});

describe("replaceBinary — macOS", () => {
  const binaryData = new TextEncoder().encode("new binary content");
  const currentPath = "/home/user/.workdone/bin/workdone";
  const expectedTempPath = currentPath + ".new";

  it("writes the new binary to a .new temp file, not directly to the current path", async () => {
    const { ops, written } = makeFileOps();
    await replaceBinary(currentPath, binaryData, "darwin", ops);

    expect(written.get(expectedTempPath)).toEqual(binaryData);
    expect(written.has(currentPath)).toBe(false);
  });

  it("sets executable permissions (0o755) on the temp file before renaming", async () => {
    const { ops, chmods } = makeFileOps();
    await replaceBinary(currentPath, binaryData, "darwin", ops);

    expect(chmods).toEqual([[expectedTempPath, 0o755]]);
  });

  it("atomically renames the temp file over the current path", async () => {
    const { ops, renamed } = makeFileOps();
    await replaceBinary(currentPath, binaryData, "darwin", ops);

    expect(renamed).toEqual([[expectedTempPath, currentPath]]);
  });
});

// ---------------------------------------------------------------------------
// cleanupStaleBinary
// ---------------------------------------------------------------------------

describe("cleanupStaleBinary", () => {
  it("deletes the .old.exe file when it exists", async () => {
    const deleted: string[] = [];
    const ops = { unlink: async (p: string) => { deleted.push(p); } };

    await cleanupStaleBinary("C:\\workdone\\bin\\workdone.exe", ops);

    expect(deleted).toEqual(["C:\\workdone\\bin\\workdone.old.exe"]);
  });

  it("does not throw when the stale file does not exist", async () => {
    const ops = { unlink: async () => { throw new Error("ENOENT: no such file"); } };

    await expect(
      cleanupStaleBinary("C:\\workdone\\bin\\workdone.exe", ops),
    ).resolves.toBeUndefined();
  });

  it("does not throw when unlink fails for any other reason", async () => {
    const ops = { unlink: async () => { throw new Error("EPERM: permission denied"); } };

    await expect(
      cleanupStaleBinary("C:\\workdone\\bin\\workdone.exe", ops),
    ).resolves.toBeUndefined();
  });

  it("is a no-op on non-Windows paths (no .exe suffix)", async () => {
    const deleted: string[] = [];
    const ops = { unlink: async (p: string) => { deleted.push(p); } };

    await cleanupStaleBinary("/home/user/.workdone/bin/workdone", ops);

    expect(deleted).toHaveLength(0);
  });
});
