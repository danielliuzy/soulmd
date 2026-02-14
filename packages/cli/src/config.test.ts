import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig, getConfigValue, setConfigValue } from "./config.js";

let tmpDir: string;
let originalHome: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-config-test-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tmpDir;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tmpDir, { recursive: true });
});

describe("loadConfig", () => {
  it("creates default config when none exists", () => {
    const config = loadConfig();
    expect(config.cache_dir).toContain(".soul/cache");
    expect(config.swap_mode).toBe("immediate");
    // Should have created the file
    expect(existsSync(join(tmpDir, ".soulrc.yaml"))).toBe(true);
  });

  it("loads existing config", () => {
    const config = loadConfig();
    config.swap_mode = "confirm";
    saveConfig(config);

    const reloaded = loadConfig();
    expect(reloaded.swap_mode).toBe("confirm");
  });

  it("merges defaults with partial config", () => {
    const config = loadConfig();
    expect(config.default_bot).toBeDefined();
    expect(config.auth_token).toBeDefined();
    expect(config.cache_dir).toBeDefined();
    expect(config.swap_mode).toBeDefined();
  });
});

describe("getConfigValue", () => {
  it("returns a config value by key", () => {
    const value = getConfigValue("swap_mode");
    expect(value).toBe("immediate");
  });

  it("returns undefined for unknown key", () => {
    const value = getConfigValue("nonexistent_key");
    expect(value).toBeUndefined();
  });
});

describe("setConfigValue", () => {
  it("sets and persists a config value", () => {
    setConfigValue("swap_mode", "confirm");
    expect(getConfigValue("swap_mode")).toBe("confirm");
  });

  it("adds new keys", () => {
    setConfigValue("custom_key", "custom_value");
    expect(getConfigValue("custom_key")).toBe("custom_value");
  });
});
