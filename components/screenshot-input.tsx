"use client";
import { useEffect, useRef, useState } from "react";
import { IMAGE_TYPES, imageFileError } from "@/lib/image-limits";
import { ImageUp } from "lucide-react";

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
      className={`screenshot-dropzone ${dragging ? "is-dragging" : ""}`}
      onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); if (enabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); pick(Array.from(event.dataTransfer.files)); }}>
      {preview ? <img src={preview} alt="Screenshot preview" className="max-h-36 w-full rounded-md object-contain" /> :
        <ImageUp size={28} className="screenshot-icon" aria-hidden="true" />}
      <span className="text-sm font-medium text-slate-200">{file ? "Click or drop to replace" : "Paste, drop, or choose a screenshot"}</span>
      {!file && <span className="text-xs leading-relaxed text-slate-400">Screenshot any assignment with Win + Shift + S, then Ctrl + V to paste it here.</span>}
      <span className="text-[11px] text-slate-400">PNG, JPEG, WebP · up to 3 MB</span>
    </button>
    {file && <button type="button" disabled={!enabled} className="button-secondary mt-2" onClick={() => onFileChange(null)}>Remove screenshot</button>}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
  </div>;
}
