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

export function getLoginUrl(): string {
  return `${API_URL}/auth/github`;
}
