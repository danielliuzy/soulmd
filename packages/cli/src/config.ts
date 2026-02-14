import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";

export interface SoulConfig {
  default_bot: string;
  auth_token: string;
  cache_dir: string;
  swap_mode: "immediate" | "confirm";
  registry_url: string;
}

function defaultConfig(): SoulConfig {
  return {
    default_bot: "http://localhost:4000",
    auth_token: "dev-token",
    cache_dir: join(homedir(), ".soul", "cache"),
    swap_mode: "immediate",
    registry_url: "https://soulmd-api.zyliu-daniel.workers.dev",
  };
}

function configPath(): string {
  return join(homedir(), ".soulrc.yaml");
}

export function loadConfig(): SoulConfig {
  const path = configPath();
  const defaults = defaultConfig();
  if (!existsSync(path)) {
    saveConfig(defaults);
    return { ...defaults };
  }
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw) as Partial<SoulConfig>;
  return { ...defaults, ...parsed };
}

export function saveConfig(config: SoulConfig): void {
  const path = configPath();
  writeFileSync(path, stringify(config), "utf-8");
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();
  const record = config as unknown as Record<string, unknown>;
  return record[key] as string | undefined;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const record = config as unknown as Record<string, string>;
  record[key] = value;
  saveConfig(config);
}
