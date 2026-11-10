export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new HttpError(503, "Set NEXT_PUBLIC_APP_URL before using the production app.");
  const url = new URL(configured || request.url);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new HttpError(503, "The production app URL must use HTTPS.");
  return url.origin;
}
export function assertSameOrigin(request: Request) {
  // Browser mutations send Origin. Reject missing headers as well as foreign sites.
  if (request.headers.get("origin") !== appOrigin(request)) throw new HttpError(403, "Request origin rejected.");
}
export function safeNext(value: string | null): string { return value === "/auth/reset" ? value : "/"; }
export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 10000): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Provide a request body.");
  const chunks: Uint8Array[] = [];
  let size = 0, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new HttpError(408, "Request body timed out.");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new HttpError(413, "Request is too large."); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function readForm(request: Request, maxBytes: number): Promise<URLSearchParams> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new HttpError(415, "Use a confirmation form.");
  return new URLSearchParams(new TextDecoder().decode(await readBoundedBody(request, maxBytes)));
}
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Use application/json.");
  const bytes = await readBoundedBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, "Invalid JSON request."); }
}
