const REPO = "codeunity/workdone";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

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
