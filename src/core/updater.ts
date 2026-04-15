const REPO = "codeunity/workdone";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface FileOps {
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  chmod: (path: string, mode: number) => Promise<void>;
}

function stripV(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

export async function fetchLatestVersion(fetcher: Fetcher): Promise<string> {
  let res: Response;
  try {
    res = await fetcher(API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (err) {
    throw new Error(
      `network error while checking for updates: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { tag_name?: unknown };
  if (typeof data.tag_name !== "string" || !data.tag_name) {
    throw new Error("GitHub API response missing tag_name");
  }

  return stripV(data.tag_name);
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): number[] => stripV(v).split(".").map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < 3; i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export function detectAssetName(platform: string, arch: string): string {
  if (platform === "win32" && arch === "x64") return "workdone-windows-x64.exe";
  if (platform === "darwin" && arch === "arm64") return "workdone-darwin-arm64";
  throw new Error(`unsupported platform: ${platform}/${arch}`);
}

export function getAssetName(): string {
  return detectAssetName(process.platform, process.arch);
}

export function buildDownloadUrls(
  version: string,
  assetName: string,
): { binaryUrl: string; checksumUrl: string } {
  const tag = version.startsWith("v") ? version : `v${version}`;
  const base = `https://github.com/${REPO}/releases/download/${tag}`;
  return {
    binaryUrl: `${base}/${assetName}`,
    checksumUrl: `${base}/${assetName}.sha256`,
  };
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function downloadAndVerify(
  fetcher: Fetcher,
  binaryUrl: string,
  checksumUrl: string,
): Promise<Uint8Array> {
  let binaryRes: Response;
  try {
    binaryRes = await fetcher(binaryUrl);
  } catch (err) {
    throw new Error(
      `failed to download binary: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!binaryRes.ok) {
    throw new Error(`failed to download binary: HTTP ${binaryRes.status}`);
  }
  const binaryData = new Uint8Array(await binaryRes.arrayBuffer());

  let checksumRes: Response;
  try {
    checksumRes = await fetcher(checksumUrl);
  } catch (err) {
    throw new Error(
      `failed to download checksum: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!checksumRes.ok) {
    throw new Error(`failed to download checksum: HTTP ${checksumRes.status}`);
  }
  const checksumText = await checksumRes.text();
  const expectedHash = checksumText.trim().split(/\s+/)[0];
  if (!expectedHash) {
    throw new Error("checksum file was empty");
  }

  const actualHash = await sha256Hex(binaryData);
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error("checksum verification failed: downloaded binary may be corrupted");
  }

  return binaryData;
}

export async function replaceBinary(  currentPath: string,
  binaryData: Uint8Array,
  platform: string,
  fileOps: FileOps,
): Promise<void> {
  if (platform === "win32") {
    const oldPath = currentPath.endsWith(".exe")
      ? currentPath.slice(0, -4) + ".old.exe"
      : currentPath + ".old";
    await fileOps.rename(currentPath, oldPath);
    await fileOps.writeFile(currentPath, binaryData);
    try {
      await fileOps.unlink(oldPath);
    } catch {
      // Non-fatal: will be cleaned up by cleanupStaleBinary on next run
    }
  } else {
    // Write to a temp file first, then atomically rename over the target.
    // Writing directly to process.execPath while the binary is running causes
    // SIGKILL on macOS because the kernel detects modification of an active
    // code-signed executable. An atomic rename swaps the directory entry to a
    // new inode, leaving the running process's mapping of the old inode intact.
    const tempPath = currentPath + ".new";
    await fileOps.writeFile(tempPath, binaryData);
    await fileOps.chmod(tempPath, 0o755);
    await fileOps.rename(tempPath, currentPath);
  }
}

export async function cleanupStaleBinary(
  currentPath: string,
  fileOps: Pick<FileOps, "unlink">,
): Promise<void> {
  if (!currentPath.endsWith(".exe")) return;
  const stalePath = currentPath.slice(0, -4) + ".old.exe";
  try {
    await fileOps.unlink(stalePath);
  } catch {
    // Silently ignore — file may not exist or may still be locked
  }
}
