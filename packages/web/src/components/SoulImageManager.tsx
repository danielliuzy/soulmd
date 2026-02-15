"use client";

import { useState, useRef, type ReactNode } from "react";
import { Upload, Sparkles, Trash2, ChevronDown, Loader2 } from "lucide-react";
import { uploadSoulImage, generateSoulImage, deleteSoulImage } from "@/lib/api";
import { revalidateHome } from "@/app/actions";

const STYLES = [
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "watercolor", label: "Watercolor" },
  { id: "minimalist", label: "Minimalist" },
  { id: "pixel-art", label: "Pixel Art" },
  { id: "cyberpunk", label: "Cyberpunk" },
] as const;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface SoulImageManagerProps {
  slug: string;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  children?: ReactNode;
}

export default function SoulImageManager({ slug, imageUrl, onImageChange, children }: SoulImageManagerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showStyles, setShowStyles] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const dragCounter = useRef(0);
  const busy = uploading || generating;

  const processFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const res = await uploadSoulImage(slug, file);
      onImageChange(res.image_url);
      await revalidateHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  const handleGenerate = async (style: string) => {
    setShowStyles(false);
    setError("");
    setGenerating(true);
    try {
      const res = await generateSoulImage(slug, style);
      onImageChange(res.image_url);
      await revalidateHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    try {
      await deleteSoulImage(slug);
      onImageChange(null);
      await revalidateHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {children && (
        <div
          className={`relative rounded-full transition-all w-fit ${
            busy ? "cursor-not-allowed" : "cursor-default"
          } ${
            dragging && !busy
              ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-card"
              : ""
          }`}
          onDragEnter={busy ? undefined : handleDragEnter}
          onDragLeave={busy ? undefined : handleDragLeave}
          onDragOver={busy ? undefined : handleDragOver}
          onDrop={busy ? undefined : handleDrop}
          onClick={undefined}
        >
          {children}
          {dragging && !busy && (
            <div className="absolute inset-0 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-xs font-medium text-accent bg-bg-card/90 px-2 py-1 rounded">
                Drop image
              </span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex flex-col items-center justify-center gap-1.5">
              <Loader2 size={24} className="text-white animate-spin" />
              <span className="text-xs text-white/80">{generating ? "Generating..." : "Uploading..."}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || generating}
          className="text-xs px-2.5 py-1.5 border border-border rounded hover:bg-bg-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={12} />
          {uploading ? "Uploading..." : "Upload"}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStyles(!showStyles)}
            disabled={uploading || generating}
            className="text-xs px-2.5 py-1.5 border border-border rounded hover:bg-bg-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles size={12} />
            {generating ? "Generating..." : "Generate"}
            <ChevronDown size={10} />
          </button>
          {showStyles && (
            <div className="absolute top-full left-0 mt-1 bg-bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleGenerate(s.id)}
                  className="block w-full text-left text-xs px-3 py-1.5 hover:bg-bg-hover transition-colors text-text"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {imageUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading || generating}
            className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-500 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
