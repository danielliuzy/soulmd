import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to mock the paths before importing swap module
// The swap module uses hardcoded paths based on homedir, so we test the logic directly
import { swapSoul, rollbackSoul, isSwapped, hasBackup, getSoulPath } from "./swap.js";

// Since swap.ts uses hardcoded paths, we test integration with real files
// by creating a temporary workspace and setting HOME

let tmpDir: string;
let originalHome: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-swap-test-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tmpDir;

  // Create the openclaw workspace directory
  mkdirSync(join(tmpDir, ".openclaw", "workspace"), { recursive: true });
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tmpDir, { recursive: true });
});

describe("swap", () => {
  it("swaps a soul file into SOUL.md", () => {
    const content = "# Test Soul\n\nHello world";
    const originalSoul = "# Original Soul\n\nI am the original.";
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), originalSoul);

    const { backedUp } = swapSoul(content);

    expect(backedUp).toBe(true);
    const written = readFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "utf-8");
    expect(written).toContain("<!-- opensoul:swapped -->");
    expect(written).toContain("Hello world");
  });

  it("backs up original SOUL.md on first swap", () => {
    const original = "# Original Soul";
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), original);

    swapSoul("# New Soul");

    expect(hasBackup()).toBe(true);
    const backup = readFileSync(join(tmpDir, ".soul", "backup", "SOUL.md.original"), "utf-8");
    expect(backup).toBe(original);
  });

  it("does not re-backup on subsequent swaps", () => {
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "# Original");

    swapSoul("# First swap");
    const { backedUp } = swapSoul("# Second swap");

    expect(backedUp).toBe(false);
    // Backup should still be the original
    const backup = readFileSync(join(tmpDir, ".soul", "backup", "SOUL.md.original"), "utf-8");
    expect(backup).toBe("# Original");
  });

  it("creates workspace directory if missing", () => {
    rmSync(join(tmpDir, ".openclaw"), { recursive: true });
    swapSoul("# New Soul");

    const written = readFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "utf-8");
    expect(written).toContain("# New Soul");
  });
});

describe("isSwapped", () => {
  it("returns false when no SOUL.md exists", () => {
    expect(isSwapped()).toBe(false);
  });

  it("returns false for an original SOUL.md", () => {
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "# Original");
    expect(isSwapped()).toBe(false);
  });

  it("returns true after a swap", () => {
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "# Original");
    swapSoul("# Swapped");
    expect(isSwapped()).toBe(true);
  });
});

describe("rollback", () => {
  it("restores the original SOUL.md from backup", () => {
    const original = "# Original Soul\n\nI am the original.";
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), original);

    swapSoul("# Swapped Soul");
    const restored = rollbackSoul();

    expect(restored).toBe(true);
    const content = readFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "utf-8");
    expect(content).toBe(original);
  });

  it("returns false when no backup exists", () => {
    expect(rollbackSoul()).toBe(false);
  });
});

describe("hasBackup", () => {
  it("returns false initially", () => {
    expect(hasBackup()).toBe(false);
  });

  it("returns true after first swap", () => {
    writeFileSync(join(tmpDir, ".openclaw", "workspace", "SOUL.md"), "# Original");
    swapSoul("# New");
    expect(hasBackup()).toBe(true);
  });
});
