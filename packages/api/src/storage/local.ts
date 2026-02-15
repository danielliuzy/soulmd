import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface StorageInterface {
  saveSoul(slug: string, content: string): Promise<string>;
  getSoul(slug: string): Promise<string | null>;
  deleteSoul(slug: string): Promise<void>;
  saveImage(slug: string, filename: string, data: ArrayBuffer, contentType: string): Promise<void>;
  getImage(slug: string, filename: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  deleteImage(slug: string, filename: string): Promise<void>;
}

export class LocalStorage implements StorageInterface {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".soul", "registry");
    mkdirSync(this.baseDir, { recursive: true });
  }

  async saveSoul(slug: string, content: string): Promise<string> {
    const filePath = this.filePath(slug);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  async getSoul(slug: string): Promise<string | null> {
    const filePath = this.filePath(slug);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  async deleteSoul(slug: string): Promise<void> {
    const dir = join(this.baseDir, slug);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  }

  async saveImage(slug: string, filename: string, data: ArrayBuffer, _contentType: string): Promise<void> {
    const filePath = join(this.baseDir, slug, filename);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from(data));
  }

  async getImage(slug: string, filename: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
    const filePath = join(this.baseDir, slug, filename);
    if (!existsSync(filePath)) return null;
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const data = readFileSync(filePath);
    return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), contentType };
  }

  async deleteImage(slug: string, filename: string): Promise<void> {
    const filePath = join(this.baseDir, slug, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  private filePath(slug: string): string {
    return join(this.baseDir, slug, "soul.md");
  }
}
