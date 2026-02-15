"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadSoul, generateSoulFromPrompt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { revalidateHome } from "@/app/actions";
import MarkdownEditor from "@/components/MarkdownEditor";

export default function UploadPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const hasFile = fileName !== null;

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setContent(text);
      setFileName(file.name);
      setError("");
    };
    reader.readAsText(file);
  }, []);

  const clearFile = () => {
    setFileName(null);
    setContent("");
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError("");
    setContent("");
    setGenerating(true);
    try {
      await generateSoulFromPrompt(prompt, (text) => {
        setContent((prev) => prev + text);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  if (!isLoading && !user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Content is required");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await uploadSoul(content);
      await revalidateHome();
      router.push(`/soul/${res.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Upload your{" "}
        <span className="text-accent">SOUL</span>.md
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col" style={{ minHeight: "calc(100vh - 16rem)" }}>
        {/* Generate from prompt */}
        <div className="mb-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the soul you want to create..."
            rows={2}
            maxLength={2000}
            disabled={hasFile || generating}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-none disabled:opacity-40 font-sans"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim() || hasFile || generating}
            className="w-full bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 mt-2 font-sans"
          >
            {generating ? "🔮 Summoning..." : "🔮 Summon"}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-muted uppercase tracking-wide">
            or upload a file
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Drop zone */}
        <div
          onDrop={generating ? undefined : handleDrop}
          onDragOver={generating ? undefined : handleDragOver}
          onDragLeave={generating ? undefined : handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
            generating
              ? "opacity-40 pointer-events-none border-border"
              : dragging
                ? "border-accent bg-accent/5"
                : hasFile
                  ? "border-accent/50 bg-accent/5"
                  : "border-border hover:border-text-muted"
          }`}
        >
          {hasFile ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-accent font-medium">{fileName}</span>
              <button
                type="button"
                onClick={clearFile}
                className="text-text-muted hover:text-text text-sm underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <p className="text-text-muted mb-1">
                Drag & drop a{" "}
                <span className="font-medium"><span className="text-accent">SOUL</span>.md</span>{" "}
                file here (or any <span className="font-medium">.md</span> file)
              </p>
              <p className="text-text-muted text-sm">
                or <span className="text-accent underline">browse files</span>
              </p>
              <input
                type="file"
                accept=".md,.soul.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-muted uppercase tracking-wide">
            or paste content
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Paste textarea */}
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Paste your SOUL.md content here..."
          readOnly={hasFile || generating}
          className={`flex-1 mb-4 ${hasFile || generating ? "opacity-40" : ""}`}
        />

        {error && <p className="text-error text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={submitting || generating || !content.trim()}
          className="bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-md font-medium transition-colors disabled:opacity-50 font-sans"
        >
          {submitting ? (
            <>
              Uploading SOUL.md...
            </>
          ) : (
            <>
              Upload SOUL.md
            </>
          )}
        </button>
      </form>
    </div>
  );
}
