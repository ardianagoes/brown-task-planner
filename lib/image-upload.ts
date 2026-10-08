import sharp from "sharp";
import { HttpError } from "./http";
import { MAX_IMAGE_BYTES, imageFileError } from "./image-limits";
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 8192;

export async function readImageUpload(request: Request): Promise<File> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new HttpError(415, "Upload one screenshot using multipart/form-data.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) throw new HttpError(413, "Screenshot upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Provide a screenshot.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new HttpError(408, "Screenshot upload timed out.");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new HttpError(413, "Screenshot upload is too large."); }
      chunks.push(part.value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new HttpError(400, "Invalid screenshot upload."); }
  const images = form.getAll("image");
  if (images.length !== 1 || !(images[0] instanceof File) || [...form.keys()].some(key => key !== "image")) throw new HttpError(400, "Upload exactly one screenshot.");
  const error = imageFileError(images[0]);
  if (error) throw new HttpError(images[0].size > MAX_IMAGE_BYTES ? 413 : 415, error);
  return images[0];
}
export async function normalizeImage(file: File): Promise<Buffer> {
  const error = imageFileError(file);
  if (error) throw new HttpError(file.size > MAX_IMAGE_BYTES ? 413 : 415, error);
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    const expected: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };
    if (metadata.format !== expected[file.type] || (metadata.pages || 1) > 1) throw new Error("Invalid image");
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).timeout({ seconds: 5 }).toBuffer();
  } catch { throw new HttpError(415, "The file is not a valid static PNG, JPEG, or WebP screenshot. Try a new capture."); }
}
