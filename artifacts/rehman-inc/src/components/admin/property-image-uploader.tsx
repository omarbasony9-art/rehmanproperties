import { useRef, useState, useCallback } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";

interface Props {
  /** Current objectKey stored in D1 (e.g. "photos/…jpg") or a full https:// URL */
  value: string;
  onChange: (value: string) => void;
  /** Base path for serving uploaded photos, e.g. "/api/photos/" */
  photoBase?: string;
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 20;

export function PropertyImageUploader({ value, onChange, photoBase = "/api/photos/" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSrc = value
    ? value.startsWith("http")
      ? value
      : `${photoBase}${value}`
    : null;

  const upload = useCallback(async (file: File) => {
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Only JPEG, PNG, or WEBP images are supported.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      // 1. Request a signed upload URL from the admin endpoint
      const urlRes = await fetch("/api/admin/properties/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type }),
      });

      if (urlRes.status === 503) {
        setError("Photo storage is not yet configured. Please paste a public image URL below instead.");
        setUploading(false);
        return;
      }
      if (!urlRes.ok) {
        const j = await urlRes.json() as { error?: string };
        throw new Error(j.error ?? "Upload request failed.");
      }

      const { uploadUrl, objectKey } = await urlRes.json() as { uploadUrl: string; objectKey: string };

      // 2. PUT the raw file bytes to R2 via our proxy
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed. Please try again.");

      onChange(objectKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (files?.[0]) upload(files[0]);
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  if (previewSrc) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden border border-border bg-muted/20 group">
        <img
          src={previewSrc}
          alt="Property photo"
          className="w-full h-52 object-cover"
          onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="bg-background/90 hover:bg-background text-foreground rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 shadow"
          >
            <Upload className="w-3.5 h-3.5" /> Replace
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="bg-destructive/90 hover:bg-destructive text-white rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 shadow"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
          h-44 cursor-pointer select-none transition-colors
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30 bg-muted/10"}`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Uploading…</p>
          </>
        ) : (
          <>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${dragging ? "bg-primary/15" : "bg-muted/50"}`}>
              <ImageIcon className={`w-6 h-6 transition-colors ${dragging ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {dragging ? "Drop to upload" : "Drag & drop a photo here"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">or click to browse · JPEG, PNG, WEBP · max 20 MB</p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
          {error.includes("not yet configured") && (
            <div className="mt-2">
              <input
                type="url"
                placeholder="Paste a public image URL instead…"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onBlur={e => { if (e.target.value.startsWith("http")) { onChange(e.target.value.trim()); setError(null); } }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
