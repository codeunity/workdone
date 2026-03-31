import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigFile, Source } from "../../../src/types";

export interface TestConfig {
  configPath: string;
  cleanup: () => Promise<void>;
}

export async function createConfig(sources: Source[], users?: string[]): Promise<TestConfig> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workdone-e2e-cfg-"));
  const configPath = path.join(dir, "config.json");
  const config: ConfigFile = { version: 1, sources, ...(users ? { users } : {}) };
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return {
    configPath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export function configEnv(configPath: string): Record<string, string> {
  return { WORKDONE_CONFIG_PATH: configPath };
}
