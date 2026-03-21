import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";

export function getConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData && appData.trim() !== "") {
      return path.join(appData, "workdone");
    }
    return path.join(os.homedir(), "AppData", "Roaming", "workdone");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "workdone");
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim() !== "") {
    return path.join(xdg, "workdone");
  }

  return path.join(os.homedir(), ".config", "workdone");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function normalizeInputPath(inputPath: string): string {
  const expanded = inputPath.startsWith("~")
    ? path.join(os.homedir(), inputPath.slice(1))
    : inputPath;
  const absolute = path.resolve(expanded);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}
