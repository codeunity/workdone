import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getConfigDir, getConfigPath } from "./paths";
import type { ConfigFile, Source } from "../types";

const DEFAULT_CONFIG: ConfigFile = {
  version: 1,
  sources: [],
};

function isSource(value: unknown): value is Source {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { type?: unknown; path?: unknown; name?: unknown };
  return candidate.type === "git-local" && typeof candidate.path === "string" && typeof candidate.name === "string";
}

function parseConfig(raw: string): ConfigFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Config file is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Config file must be a JSON object");
  }
  const candidate = parsed as { version?: unknown; sources?: unknown; users?: unknown };
  if (candidate.version !== 1) {
    throw new Error("Unsupported config version");
  }
  if (!Array.isArray(candidate.sources) || !candidate.sources.every(isSource)) {
    throw new Error("Config file has invalid sources");
  }
  if (candidate.users !== undefined && (!Array.isArray(candidate.users) || !candidate.users.every((u) => typeof u === "string"))) {
    throw new Error("Config file has invalid users");
  }

  const result: ConfigFile = { version: 1, sources: candidate.sources };
  if (Array.isArray(candidate.users) && candidate.users.length > 0) {
    result.users = candidate.users;
  }
  return result;
}

export async function loadConfig(): Promise<ConfigFile> {
  const configPath = getConfigPath();
  try {
    const raw = await readFile(configPath, "utf8");
    return parseConfig(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveConfig(config: ConfigFile): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
