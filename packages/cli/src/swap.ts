import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const SWAP_MARKER = "<!-- opensoul:swapped -->";

function soulPath(): string {
  return join(homedir(), ".openclaw", "workspace", "SOUL.md");
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
