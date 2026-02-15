import type { StorageInterface } from "./local.js";

export class S3Storage implements StorageInterface {
  private endpoint: string;
  private bucket: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor(opts: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.bucket = opts.bucket;
    this.accessKeyId = opts.accessKeyId;
    this.secretAccessKey = opts.secretAccessKey;
  }

  private async signedFetch(
    method: string,
    key: string,
    body?: string,
  ): Promise<Response> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
    const amzDate = `${dateStamp}T${now.toISOString().replace(/[-:]/g, "").slice(9, 15)}Z`;
    const region = "auto";
    const service = "s3";

    const headers: Record<string, string> = {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      host: new URL(url).host,
    };

    if (body !== undefined) {
      headers["content-type"] = "text/markdown";
    }

    // Build canonical request
    const parsedUrl = new URL(url);
    const canonicalUri = parsedUrl.pathname;
    const canonicalQueryString = "";
    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[k]}\n`)
      .join("");

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    // String to sign
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256Hex(canonicalRequest);
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      canonicalRequestHash,
    ].join("\n");

    // Signing key
    const kDate = await hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, "aws4_request");

    const signature = await hmacHex(kSigning, stringToSign);

    headers[
      "authorization"
    ] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });
  }

  async saveSoul(slug: string, content: string): Promise<string> {
    const key = `${slug}/soul.md`;
    const res = await this.signedFetch("PUT", key, content);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 PUT failed (${res.status}): ${text}`);
    }
    return key;
  }

  async getSoul(slug: string): Promise<string | null> {
    try {
      const res = await this.signedFetch("GET", `${slug}/soul.md`);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async deleteSoul(slug: string): Promise<void> {
    await this.signedFetch("DELETE", `${slug}/soul.md`);
  }
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return bufToHex(hash);
}

async function hmac(
  key: string | ArrayBuffer,
  data: string,
): Promise<ArrayBuffer> {
  const keyBuffer =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const result = await hmac(key, data);
  return bufToHex(result);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
