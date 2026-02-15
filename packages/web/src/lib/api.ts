import type {
  Soul,
  SoulListResponse,
  SoulDetailResponse,
  RateResponse,
  UploadResponse,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("opensoul_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}

export function listSouls(params: {
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
  tag?: string;
}): Promise<SoulListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.sort) sp.set("sort", params.sort);
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.tag) sp.set("tag", params.tag);
  const qs = sp.toString();
  return apiFetch<SoulListResponse>(`/souls${qs ? `?${qs}` : ""}`);
}

export function getSoul(id: string): Promise<SoulDetailResponse> {
  return apiFetch<SoulDetailResponse>(`/souls/${id}`);
}

export function getSoulContent(id: string): Promise<string> {
  return apiFetch<string>(`/souls/${id}/content`);
}

export function rateSoul(
  id: string,
  rating: number
): Promise<RateResponse> {
  return apiFetch<RateResponse>(`/souls/${id}/rate`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

export function uploadSoul(content: string): Promise<UploadResponse> {
  return apiFetch<UploadResponse>("/souls", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function getUser(username: string): Promise<{ id: number; username: string; avatar: string }> {
  return apiFetch<{ id: number; username: string; avatar: string }>(`/users/${username}`);
}

export function getUserSouls(
  username: string,
  page?: number,
  limit?: number,
): Promise<SoulListResponse> {
  const sp = new URLSearchParams();
  if (page) sp.set("page", String(page));
  if (limit) sp.set("limit", String(limit));
  const qs = sp.toString();
  return apiFetch<SoulListResponse>(
    `/users/${username}/souls${qs ? `?${qs}` : ""}`,
  );
}

export function updateSoul(
  id: string,
  fields: { name?: string; description?: string; label?: string }
): Promise<Soul> {
  return apiFetch<Soul>(`/souls/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export function updateSoulContent(id: string, content: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/souls/${id}/content`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function deleteSoul(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/souls/${id}`, { method: "DELETE" });
}

export function getSoulImageUrl(slug: string): string {
  return `${API_URL}/souls/${slug}/image`;
}

export async function uploadSoulImage(slug: string, file: File): Promise<{ image_url: string }> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": file.type,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/souls/${slug}/image`, {
    method: "POST",
    headers,
    body: await file.arrayBuffer(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export async function generateSoulImage(slug: string, style: string): Promise<{ image_url: string }> {
  return apiFetch<{ image_url: string }>(`/souls/${slug}/image/generate`, {
    method: "POST",
    body: JSON.stringify({ style }),
  });
}

export async function deleteSoulImage(slug: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/souls/${slug}/image`, { method: "DELETE" });
}

export async function generateSoulFromPrompt(
  prompt: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/souls/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? `API error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as { text?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) onChunk(parsed.text);
      } catch (e) {
        if (e instanceof Error && e.message !== data) throw e;
      }
    }
  }
}

export function getLoginUrl(): string {
  return `${API_URL}/auth/github`;
}
