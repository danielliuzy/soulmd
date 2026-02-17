import { notFound } from "next/navigation";
import type { SoulDetailResponse } from "@/lib/types";
import SoulDetail from "./SoulDetail";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

async function fetchSoul(id: string): Promise<SoulDetailResponse | null> {
  const res = await fetch(`${API_URL}/souls/${id}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function fetchContent(id: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/souls/${id}/content`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.text();
}

export default async function SoulDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [soul, content] = await Promise.all([fetchSoul(id), fetchContent(id)]);

  if (!soul) notFound();

  return <SoulDetail soul={soul} content={content} id={id} />;
}
