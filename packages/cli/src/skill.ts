import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKILL_DIR_NAME = "opensoul";

function skillsDir(): string {
  return loadConfig().skills_path;
}

function skillDir(): string {
  return join(skillsDir(), SKILL_DIR_NAME);
}

function skillPath(): string {
  return join(skillDir(), "SKILL.md");
}

function loadSkillContent(): string {
  // SKILL.md is bundled at the package root (sibling to dist/)
  const path = join(__dirname, "..", "SKILL.md");
  return readFileSync(path, "utf-8");
}

export function isSkillInstalled(): boolean {
  return existsSync(skillPath());
}

export function getSkillPath(): string {
  return skillPath();
}

export function installSkill(): { path: string; updated: boolean } {
  const dir = skillDir();
  const path = skillPath();
  const updated = existsSync(path);

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, loadSkillContent(), "utf-8");

  return { path, updated };
}

export function uninstallSkill(): boolean {
  if (!existsSync(skillPath())) return false;

  rmSync(skillDir(), { recursive: true });
  return true;
}
