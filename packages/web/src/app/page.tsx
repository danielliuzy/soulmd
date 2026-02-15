import Link from "next/link";
import SoulCard from "@/components/SoulCard";
import InstallerWidget from "@/components/InstallerWidget";
import GhostMascot from "@/components/GhostMascot";
import { AnimatedSection } from "@/components/AnimatedSection";
import type { SoulListResponse } from "@/lib/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

async function fetchSouls(params: Record<string, string>): Promise<SoulListResponse> {
  const sp = new URLSearchParams(params);
  const res = await fetch(`${API_URL}/souls?${sp}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  return res.json();
}

export default async function HomePage() {
  const [topRes, recentRes] = await Promise.all([
    fetchSouls({ sort: "top", limit: "6" }),
    fetchSouls({ limit: "6" }),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="text-center pt-2 pb-12">
        <GhostMascot />
        <AnimatedSection>
          <h1 className="text-4xl md:text-6xl font-bold mb-2">
            Open<span className="text-accent">SOUL</span>.md
          </h1>
        </AnimatedSection>
        <AnimatedSection delay={0.08}>
          <p className="text-text text-xl max-w-xl mx-auto mb-5">
            Your agent deserves a <span className="text-accent">SOUL</span>
          </p>
        </AnimatedSection>
        <AnimatedSection delay={0.15}>
          <div className="flex items-center justify-center gap-4 mb-5">
            <Link
              href="/browse"
              className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors shadow-md shadow-accent/20"
            >
              Browse
            </Link>
            <Link
              href="/upload"
              className="border-2 border-accent text-accent hover:bg-accent hover:text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
            >
              Upload
            </Link>
          </div>
        </AnimatedSection>
        <AnimatedSection delay={0.22}>
          <div className="inline-flex flex-col items-center">
            <InstallerWidget />
          </div>
        </AnimatedSection>
      </section>

      {/* Top Rated */}
      {topRes.data.length > 0 && (
        <AnimatedSection delay={0.3} className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Top Rated</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topRes.data.map((soul, i) => (
              <AnimatedSection key={soul.id} delay={0.35 + i * 0.04}>
                <SoulCard soul={soul} />
              </AnimatedSection>
            ))}
          </div>
        </AnimatedSection>
      )}

      {/* Recently Added */}
      {recentRes.data.length > 0 && (
        <AnimatedSection delay={0.35}>
          <h2 className="text-xl font-semibold mb-4">Recently Added</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentRes.data.map((soul, i) => (
              <AnimatedSection key={soul.id} delay={0.4 + i * 0.04}>
                <SoulCard soul={soul} />
              </AnimatedSection>
            ))}
          </div>
        </AnimatedSection>
      )}
    </div>
  );
}
