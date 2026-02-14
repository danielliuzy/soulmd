import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cacheSoul, listCached, getCached } from "./cache.js";

let tmpDir: string;
let originalHome: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-cache-test-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tmpDir;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tmpDir, { recursive: true });
});

describe("cacheSoul", () => {
  it("saves a soul file to the cache", () => {
    const path = cacheSoul("Test Soul", "# Test Content", "abc123");
    expect(path).toContain("test-soul.soul.md");
  });

  it("updates an existing cached soul", () => {
    cacheSoul("Test Soul", "# Version 1", "hash1");
    cacheSoul("Test Soul", "# Version 2", "hash2");

    const entries = listCached();
    expect(entries).toHaveLength(1);
    expect(entries[0].hash).toBe("hash2");
  });
});

describe("listCached", () => {
  it("returns empty array when no souls cached", () => {
    expect(listCached()).toEqual([]);
  });

  it("returns all cached souls", () => {
    cacheSoul("Soul A", "# A content", "hash-a");
    cacheSoul("Soul B", "# B content", "hash-b");

    const entries = listCached();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name)).toContain("Soul A");
    expect(entries.map((e) => e.name)).toContain("Soul B");
  });
});

describe("getCached", () => {
  it("returns null for non-existent soul", () => {
    expect(getCached("nonexistent")).toBeNull();
  });

  it("retrieves cached soul content", () => {
    cacheSoul("Test Soul", "# Hello", "abc123");

    const result = getCached("Test Soul");
    expect(result).not.toBeNull();
    expect(result!.content).toBe("# Hello");
    expect(result!.entry.hash).toBe("abc123");
  });

  it("retrieves soul case-insensitively", () => {
    cacheSoul("Test Soul", "# Hello", "abc123");

    const result = getCached("test soul");
    expect(result).not.toBeNull();
    expect(result!.content).toBe("# Hello");
  });
});
