import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "./config.js";

const SWAP_MARKER = "<!-- opensoul:swapped -->";

function soulPath(): string {
  const p = loadConfig().soul_path;
  if (existsSync(p) && statSync(p).isDirectory()) {
    return join(p, "SOUL.md");
  }
  return p;
}

function backupDir(): string {
  return join(homedir(), ".soul", "backup");
}

function backupPath(): string {
  return join(backupDir(), "SOUL.md.original");
}

export function getSoulPath(): string {
  return soulPath();
}

export function isSwapped(): boolean {
  const p = soulPath();
  if (!existsSync(p)) return false;
  const content = readFileSync(p, "utf-8");
  return content.startsWith(SWAP_MARKER);
}

export function readCurrentSoul(): string | null {
  const p = soulPath();
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

export function hasBackup(): boolean {
  return existsSync(backupPath());
}

export function swapSoul(newContent: string): { backedUp: boolean } {
  let backedUp = false;
  const p = soulPath();

  // If current SOUL.md is NOT already a swapped one, back it up
  if (!isSwapped() && existsSync(p)) {
    mkdirSync(backupDir(), { recursive: true });
    copyFileSync(p, backupPath());
    backedUp = true;
  }

  // Write the new soul with the swap marker
  mkdirSync(dirname(p), { recursive: true });
  const marked = `${SWAP_MARKER}\n${newContent}`;
  writeFileSync(p, marked, "utf-8");

  return { backedUp };
}

export function rollbackSoul(): boolean {
  if (!existsSync(backupPath())) return false;

  copyFileSync(backupPath(), soulPath());
  return true;
}
