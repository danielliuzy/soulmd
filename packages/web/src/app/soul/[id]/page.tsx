"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSoul, getSoulContent, getSoulImageUrl, rateSoul, updateSoul, updateSoulContent, deleteSoul } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SoulDetailResponse } from "@/lib/types";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import MarkdownEditor from "@/components/MarkdownEditor";
import StarRating from "@/components/StarRating";
import { Pencil, Copy, Check, Download, Trash2, SquarePen } from "lucide-react";
import SoulAvatar from "@/components/SoulAvatar";
import SoulImageManager from "@/components/SoulImageManager";

export default function SoulDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [soul, setSoul] = useState<SoulDetailResponse | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cliCopied, setCliCopied] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  const [editing, setEditing] = useState<"name" | "label" | "desc" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [imageVersion, setImageVersion] = useState(() => Date.now());
  const [showLightbox, setShowLightbox] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isOwner = !!(user && soul && soul.user_id === user.id);

  useEffect(() => {
    if (!params.id) return;
    getSoul(params.id).then(setSoul).catch(() => setNotFound(true));
    getSoulContent(params.id).then(setContent).catch(() => {});
  }, [params.id]);

  const handleRate = async (rating: number) => {
    if (!user || ratingLoading) return;
    setRatingLoading(true);
    try {
      const res = await rateSoul(params.id, rating);
      setSoul((prev) =>
        prev
          ? { ...prev, rating_avg: res.rating_avg, rating_count: res.rating_count }
          : prev
      );
    } finally {
      setRatingLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!soul || saving || !nameDraft.trim()) return;
    setSaving(true);
    try {
      const updated = await updateSoul(params.id, { name: nameDraft.trim() });
      setSoul((prev) => prev ? { ...prev, name: updated.name, label: updated.label } : prev);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLabel = async () => {
    if (!soul || saving || !labelDraft.trim()) return;
    setSaving(true);
    setLabelError("");
    try {
      const sanitized = labelDraft.trim().replace(/\s+/g, "-");
      const updated = await updateSoul(params.id, { label: sanitized });
      setSoul((prev) => prev ? { ...prev, label: updated.label } : prev);
      setEditing(null);
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : "Label already taken");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDesc = async () => {
    if (!soul || saving) return;
    setSaving(true);
    try {
      const updated = await updateSoul(params.id, { description: descDraft });
      setSoul((prev) => prev ? { ...prev, description: updated.description } : prev);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-8xl font-bold mb-2">
          4<span className="text-accent">0</span>4
        </p>
        <p className="text-text-muted text-lg mb-8">
          This soul has moved on to the other side.
        </p>
        <Link
          href="/"
          className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md shadow-accent/20"
        >
          Go Home
        </Link>
      </div>
    );
  }

  if (!soul) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-bg-card rounded w-1/3" />
        <div className="h-64 bg-bg-card rounded" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {content ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                {editing === "name" ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditing(null); }}
                      className="text-2xl font-bold text-text bg-bg-input border border-border rounded px-2 py-1 flex-1 min-w-0"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={saving || !nameDraft.trim()}
                      className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="text-xs px-2 py-1 text-text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-accent truncate">{soul.name}</h1>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => { setNameDraft(soul.name); setEditing("name"); }}
                        className="text-text-muted hover:text-text transition-colors shrink-0"
                        title="Edit name"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                )}
                {!editingContent && (
                  <div className="flex gap-2 shrink-0 font-sans">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(content);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="text-sm px-3 sm:px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium flex items-center gap-1.5"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span className="hidden sm:inline">{copied ? "Copied!" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([content], { type: "text/markdown" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${soul.label}.SOUL.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                        // Track download
                        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1"}/souls/${params.id}/download`, { method: "POST" }).catch(() => {});
                        setSoul((prev) => prev ? { ...prev, downloads_count: prev.downloads_count + 1 } : prev);
                      }}
                      className="text-sm px-3 sm:px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium flex items-center gap-1.5"
                    >
                      <Download size={14} />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => { setContentDraft(content); setEditingContent(true); }}
                        className="text-sm px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-1.5"
                      >
                        <SquarePen size={14} />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="text-sm px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-1.5"
                      >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <hr className="border-border mb-4" />
              {editingContent ? (
                <div className="flex flex-col" style={{ minHeight: "calc(100vh - 16rem)" }}>
                  <MarkdownEditor
                    value={contentDraft}
                    onChange={setContentDraft}
                    className="flex-1"
                  />
                  <div className="flex gap-2 mt-3 font-sans">
                    <button
                      type="button"
                      onClick={async () => {
                        setSavingContent(true);
                        try {
                          await updateSoulContent(params.id, contentDraft);
                          setContent(contentDraft);
                          setEditingContent(false);
                        } finally {
                          setSavingContent(false);
                        }
                      }}
                      disabled={savingContent}
                      className="text-sm px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors font-medium disabled:opacity-50"
                    >
                      {savingContent ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingContent(false)}
                      className="text-sm px-4 py-2 border border-border text-text rounded-lg hover:bg-bg-card transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <MarkdownRenderer content={content} />
              )}
            </>
          ) : (
            <div className="h-64 bg-bg-card rounded animate-pulse" />
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <div className="bg-bg-card border border-border rounded-lg p-5 space-y-4 sticky top-20">
            {/* Avatar */}
            {isOwner ? (
              <div className="flex flex-col items-center gap-3">
                <SoulImageManager
                  slug={soul.slug}
                  imageUrl={soul.image_url}
                  onImageChange={(imageUrl) => {
                    setSoul((prev) => prev ? { ...prev, image_url: imageUrl } : prev);
                    setImageVersion(Date.now());
                  }}
                >
                  <button type="button" onClick={() => soul.image_url && setShowLightbox(true)} className={`block leading-none ${soul.image_url ? "cursor-pointer" : ""}`}>
                    <SoulAvatar key={imageVersion} soul={soul} size={128} version={imageVersion} />
                  </button>
                </SoulImageManager>
              </div>
            ) : (
              <div className="flex justify-center">
                <button type="button" onClick={() => soul.image_url && setShowLightbox(true)} className={`block leading-none ${soul.image_url ? "cursor-pointer" : ""}`}>
                  <SoulAvatar key={imageVersion} soul={soul} size={128} version={imageVersion} />
                </button>
              </div>
            )}

            {/* Label */}
            {editing === "label" ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditing(null); }}
                  className="w-full text-sm font-mono text-text bg-bg-input border border-border rounded px-2 py-1"
                  autoFocus
                />
                {labelError && <p className="text-error text-xs">{labelError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveLabel}
                    disabled={saving || !labelDraft.trim()}
                    className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(null); setLabelError(""); }}
                    className="text-xs px-2 py-1 text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-text">{soul.label}</p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => { setLabelDraft(soul.label); setEditing("label"); }}
                    className="text-text-muted hover:text-text transition-colors"
                    title="Edit label"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}

            <div>
              <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                Install via CLI
              </span>
              <div className="relative mt-1">
                <code className="block text-sm bg-bg-input border border-border rounded px-3 py-2 pr-9 text-accent">
                  soul possess {soul.label}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`soul possess ${soul.label}`);
                    setCliCopied(true);
                    setTimeout(() => setCliCopied(false), 2000);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                  title="Copy to clipboard"
                >
                  {cliCopied ? (
                    <Check size={14} className="text-accent" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>

            {/* Description */}
            {editing === "desc" ? (
              <div className="space-y-2">
                <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                  Description
                </span>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full text-sm text-text bg-bg-input border border-border rounded px-2 py-1 min-h-[60px]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDesc}
                    disabled={saving}
                    className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="text-xs px-2 py-1 text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              (soul.description || isOwner) && (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                      Description
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => { setDescDraft(soul.description ?? ""); setEditing("desc"); }}
                        className="text-text-muted hover:text-text transition-colors"
                        title="Edit description"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                  {soul.description && (
                    <p className="text-sm text-text">{soul.description}</p>
                  )}
                </div>
              )
            )}

            <div>
              <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                Rating
              </span>
              <div className="flex items-center gap-2 mt-1">
                <StarRating
                  value={Math.round(soul.rating_avg)}
                  onChange={user ? handleRate : undefined}
                  readonly={!user}
                />
                <span className="text-sm text-text-muted">
                  {soul.rating_avg > 0 ? soul.rating_avg.toFixed(1) : "—"}
                  {soul.rating_count > 0 && ` (${soul.rating_count})`}
                </span>
              </div>
              {!user && (
                <p className="text-xs text-text-muted mt-1">
                  Login to rate this soul
                </p>
              )}
            </div>
            <div>
              <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                Downloads
              </span>
              <p className="text-sm text-text mt-1">{soul.downloads_count.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                Author
              </span>
              <Link href={`/user/${soul.author}`} className="block text-accent font-medium underline hover:text-accent/80 transition-colors">
                {soul.author}
              </Link>
            </div>
            {soul.tags.length > 0 && (
              <div>
                <span className="text-xs text-text-muted uppercase tracking-wide font-sans">
                  Tags
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {soul.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-text-muted">
              Updated: {new Date(soul.updated_at.endsWith("Z") ? soul.updated_at : soul.updated_at + "Z").toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: true })}
            </p>
          </div>
        </aside>
      </div>

      {/* Image lightbox */}
      {showLightbox && soul.image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
          onClick={() => setShowLightbox(false)}
        >
          <Image
            src={`${getSoulImageUrl(soul.slug)}?v=${encodeURIComponent(soul.image_url)}&t=${imageVersion}`}
            alt={soul.name}
            width={400}
            height={400}
            className="max-w-[min(400px,80vw)] max-h-[min(400px,80vh)] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-text mb-2">Delete soul</h3>
            <p className="text-sm text-text-muted mb-6">
              Are you sure you want to delete <strong>{soul.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="text-sm px-4 py-2 border border-border rounded-lg text-text hover:bg-bg-input transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteSoul(params.id);
                    router.back();
                  } catch {
                    setDeleting(false);
                    setShowDeleteModal(false);
                  }
                }}
                disabled={deleting}
                className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
