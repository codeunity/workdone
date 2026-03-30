export type SourceType = "git-local";

export interface Source {
  type: SourceType;
  path: string;
  name: string;
}

export interface ConfigFile {
  version: 1;
  sources: Source[];
}

export type InvalidReason = "missing" | "not_directory" | "not_git_repo" | "not_accessible";

export interface ValidationResult {
  source: Source;
  valid: boolean;
  reason?: InvalidReason;
}

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  changedLines: number;
  binary: boolean;
}

export interface CommitEntry {
  repoPath: string;
  repoName: string;
  hash: string;
  authorEmail: string;
  date: Date;
  subject: string;
  files: FileChange[];
}

export interface DayGroup {
  dateKey: string;
  label: string;
  commits: CommitEntry[];
}

export interface WeeklyReport {
  rangeStart: Date;
  generatedAt: Date;
  days: DayGroup[];
}
