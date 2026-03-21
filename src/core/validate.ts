import { stat } from "node:fs/promises";
import { isGitRepo } from "./git";
import type { Source, ValidationResult } from "../types";

export async function validateSource(source: Source): Promise<ValidationResult> {
  try {
    const sourceStat = await stat(source.path);
    if (!sourceStat.isDirectory()) {
      return { source, valid: false, reason: "not_directory" };
    }
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return { source, valid: false, reason: "missing" };
    }
    if (errno.code === "EACCES" || errno.code === "EPERM") {
      return { source, valid: false, reason: "not_accessible" };
    }
    return { source, valid: false, reason: "not_accessible" };
  }

  const git = await isGitRepo(source.path);
  if (!git) {
    return { source, valid: false, reason: "not_git_repo" };
  }
  return { source, valid: true };
}

export async function validateSources(sources: Source[]): Promise<ValidationResult[]> {
  return Promise.all(sources.map((source) => validateSource(source)));
}
