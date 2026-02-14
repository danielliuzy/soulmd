import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-skill-test-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpDir;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tmpDir, { recursive: true });
});

describe("skill install/uninstall", () => {
  it("installs the skill to ~/.openclaw/skills/opensoul/SKILL.md", async () => {
    const { installSkill, isSkillInstalled, getSkillPath } = await import("./skill.js");

    expect(isSkillInstalled()).toBe(false);

    const { path, updated } = installSkill();
    expect(updated).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(path).toBe(getSkillPath());
    expect(isSkillInstalled()).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content).toContain("name: opensoul");
    expect(content).toContain("soul search");
    expect(content).toContain("soul swap");
    expect(content).toContain("soul rollback");
    expect(content).toContain("--no-interactive");
  });

  it("reports updated=true when reinstalling", async () => {
    const { installSkill } = await import("./skill.js");

    const first = installSkill();
    expect(first.updated).toBe(false);

    const second = installSkill();
    expect(second.updated).toBe(true);
  });

  it("uninstalls the skill", async () => {
    const { installSkill, uninstallSkill, isSkillInstalled } = await import("./skill.js");

    installSkill();
    expect(isSkillInstalled()).toBe(true);

    const removed = uninstallSkill();
    expect(removed).toBe(true);
    expect(isSkillInstalled()).toBe(false);
  });

  it("returns false when uninstalling non-existent skill", async () => {
    const { uninstallSkill } = await import("./skill.js");
    expect(uninstallSkill()).toBe(false);
  });

  it("creates parent directories if they don't exist", async () => {
    const { installSkill, getSkillPath } = await import("./skill.js");

    // HOME dir exists but .openclaw/skills/ does not
    const { path } = installSkill();
    expect(existsSync(path)).toBe(true);
    expect(path).toContain(".openclaw/skills/opensoul/SKILL.md");
  });
});
