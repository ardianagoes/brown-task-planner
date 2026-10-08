"use client";
import { useEffect, useRef, useState } from "react";
import { IMAGE_TYPES, imageFileError } from "@/lib/image-limits";

export default function ScreenshotInput({ file, onFileChange, enabled, error, onError }: {
  file: File | null; onFileChange: (file: File | null) => void; enabled: boolean; error: string; onError: (error: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const pick = (files: File[]) => {
    if (!enabled) return;
    if (files.length !== 1) { onError("Choose one screenshot at a time."); return; }
    const problem = imageFileError(files[0]);
    if (problem) { onError(problem); return; }
    onError(""); onFileChange(files[0]);
  };
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!enabled) return;
    const paste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=textbox]")) return;
      const files = Array.from(event.clipboardData?.files || []);
      if (!files.length) return;
      event.preventDefault(); pick(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }); // Uses the current enabled callback and never intercepts text-field paste.
  return <div>
    <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1}
      aria-label="Upload screenshot" disabled={!enabled} onChange={event => {
        if (event.target.files?.length) pick(Array.from(event.target.files)); event.target.value = "";
      }} />
    <button type="button" disabled={!enabled} aria-label={file ? "Replace screenshot" : "Choose screenshot"}
      className={`flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors disabled:opacity-50 ${dragging ? "border-blue-400 bg-blue-950/40" : "border-slate-600 bg-slate-950/30 hover:border-blue-400"}`}
      onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); if (enabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); pick(Array.from(event.dataTransfer.files)); }}>
      {preview ? <img src={preview} alt="Screenshot preview" className="max-h-36 w-full rounded-md object-contain" /> :
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-300" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" />
        </svg>}
      <span className="text-sm font-medium text-slate-200">{file ? "Click or drop to replace" : "Paste, drop, or choose a screenshot"}</span>
      {!file && <span className="text-xs leading-relaxed text-slate-400">Screenshot any assignment with Win + Shift + S, then Ctrl + V to paste it here.</span>}
      <span className="text-[11px] text-slate-400">PNG, JPEG, WebP · up to 3 MB</span>
    </button>
    {file && <button type="button" disabled={!enabled} className="button-secondary mt-2" onClick={() => onFileChange(null)}>Remove screenshot</button>}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
  </div>;
}
