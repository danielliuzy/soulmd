import Link from "next/link";
import { Download } from "lucide-react";
import type { Soul } from "@/lib/types";

export default function SoulCard({ soul }: { soul: Soul }) {
  return (
    <Link
      href={`/soul/${soul.slug}`} /* slug contains nanoid */
      className="block bg-bg-card border border-border rounded-lg p-5 hover:border-accent/50 hover:bg-bg-hover transition-all"
    >
      <h3 className="font-semibold text-text truncate">{soul.name}</h3>
      <p className="text-sm text-text-muted mt-1 line-clamp-2 min-h-[2.5rem]">
        {soul.description ?? "No description"}
      </p>
      <div className="flex items-center gap-3 mt-4">
        <div className="flex items-center gap-1">
          <span className="text-star text-sm">&#9733;</span>
          <span className="text-sm text-text-muted">
            {soul.rating_avg > 0 ? soul.rating_avg.toFixed(1) : "—"}
          </span>
          {soul.rating_count > 0 && (
            <span className="text-xs text-text-muted">
              ({soul.rating_count})
            </span>
          )}
        </div>
        {soul.downloads_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Download size={12} />
            {soul.downloads_count.toLocaleString()}
          </span>
        )}
      </div>
      {soul.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {soul.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
