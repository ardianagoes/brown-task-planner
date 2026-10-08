import { imageFileError } from "./image-limits";
import { parseOcrText } from "./ocr-parser";
import type { Extraction } from "./assignment-draft";
export type OcrProgress = { percent: number; label: string };
export const OCR_TIMEOUT_MS = 90000;
const FAILURE = "OCR could not read this screenshot. Fill in the details below, or try a clearer capture.";

export function imageMatchesType(bytes: Uint8Array, type: string): boolean {
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return type === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}
async function prepareImage(file: File, signal?: AbortSignal): Promise<Blob> {
  const error = imageFileError(file); if (error) throw new Error(error);
  if (!imageMatchesType(new Uint8Array(await file.arrayBuffer()), file.type)) throw new Error("The image contents do not match its file type.");
  signal?.throwIfAborted();
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 16_000_000) throw new Error("Use a screenshot under 16 million pixels.");
    const scale = Math.min(2, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error(FAILURE);
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    signal?.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(FAILURE)), "image/png"));
  } finally { image.close(); }
}
export async function analyzeScreenshotLocally(file: File, timezone: string, onProgress: (progress: OcrProgress) => void = () => {},
  signal?: AbortSignal, dependencies: { prepare?: typeof prepareImage; worker?: () => Worker; timeoutMs?: number; now?: Date } = {}): Promise<Extraction> {
  signal?.throwIfAborted(); onProgress({ percent: 0, label: "Preparing image locally" });
  const image = await (dependencies.prepare || prepareImage)(file, signal);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = (dependencies.worker || (() => new Worker("/ocr-runner.js")))();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); };
    const fail = () => { cleanup(); reject(new Error(FAILURE)); };
    const abort = () => { cleanup(); reject(new DOMException("OCR cancelled.", "AbortError")); };
    const timer = setTimeout(fail, dependencies.timeoutMs ?? OCR_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }) => {
      if (data?.type === "progress") {
        const recognizing = data.status === "recognizing text";
        const progress = Number.isFinite(data.progress) ? Math.max(0, Math.min(1, data.progress)) : 0;
        onProgress({ percent: recognizing ? Math.round(35 + progress * 64) : Math.round(progress * 30),
          label: recognizing ? "Reading screenshot text locally" : "Loading local OCR engine" });
      } else if (data?.type === "error") fail();
      else if (data?.type === "result") {
        cleanup();
        try {
          if (typeof data.text !== "string" || data.text.length > 50000 || !Number.isFinite(data.confidence)) throw new Error(FAILURE);
          const extraction = parseOcrText(data.text, timezone, dependencies.now, data.confidence);
          onProgress({ percent: 100, label: "Ready to review" }); resolve(extraction);
        } catch { reject(new Error(FAILURE)); }
      }
    };
    try { worker.postMessage({ image }); } catch { fail(); }
  });
}
