import type { ConfigFile } from "../types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): void {
  if (!EMAIL_REGEX.test(email.trim())) {
    throw new Error(`invalid email address: ${email}`);
  }
}

export function listUsers(config: ConfigFile): string[] {
  return config.users ?? [];
}

export function addUser(config: ConfigFile, email: string): ConfigFile {
  validateEmail(email);
  const normalised = email.trim().toLowerCase();
  const existing = (config.users ?? []).map((u) => u.trim().toLowerCase());
  if (existing.includes(normalised)) {
    return config;
  }
  return { ...config, users: [...(config.users ?? []), email.trim()] };
}

export function removeUser(config: ConfigFile, email: string): ConfigFile {
  const normalised = email.trim().toLowerCase();
  const current = config.users ?? [];
  const next = current.filter((u) => u.trim().toLowerCase() !== normalised);
  if (next.length === current.length) {
    return config;
  }
  const updated: ConfigFile = { ...config, users: next };
  if (next.length === 0) {
    delete updated.users;
  }
  return updated;
}
