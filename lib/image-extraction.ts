import { assertSameOrigin, HttpError } from "./http";
import { readImageUpload, normalizeImage } from "./image-upload";
import { DEFAULT_IMAGE_MODEL, extractWithOpenAI } from "./openai-image";
import { referenceDay, type Extraction } from "./assignment-draft";
import type { Admission } from "./ai-admission";
type Access = { consumeSlot: () => Promise<{ allowed: boolean; retryAfter: number }>; reserve: () => Promise<Admission> };
export class ExtractionLimitError extends HttpError {
  constructor(public retryAfter: number) { super(429, "Screenshot analysis limit reached. Try later or use Manual Entry."); }
}
export async function processImageExtraction(request: Request, dependencies: {
  authorize: () => Promise<Access>; enabled?: boolean; apiKey?: string; model?: string; timezone?: string; now?: Date; extract?: typeof extractWithOpenAI;
}): Promise<{ extraction: Extraction }> {
  assertSameOrigin(request);
  const access = await dependencies.authorize();
  if (dependencies.enabled !== true) throw new HttpError(503, "Screenshot analysis is paused by the app owner. Use Manual Entry; your tasks and calendar imports still work.");
  if (!dependencies.apiKey?.trim()) throw new HttpError(503, "Screenshot analysis is not configured. Set OPENAI_API_KEY on the server; Manual Entry is still available.");
  const admission = await access.reserve();
  if (!admission.allowed) {
    if (admission.reason === "account") throw new HttpError(403, "Screenshot analysis requires app-owner approval for this account. Use Manual Entry.");
    if (admission.reason === "duplicate") throw new HttpError(409, "This screenshot request was already submitted. Review the existing result or explicitly start a new analysis.");
    throw new ExtractionLimitError(admission.retryAfter);
  }
  const slot = await access.consumeSlot();
  if (!slot.allowed) throw new ExtractionLimitError(slot.retryAfter);
  const file = await readImageUpload(request);
  const pixels = await normalizeImage(file);
  const timezone = dependencies.timezone || "America/New_York";
  const context = { referenceDate: referenceDay(dependencies.now || new Date(), timezone), timezone };
  const extraction = await (dependencies.extract || extractWithOpenAI)(pixels, dependencies.apiKey, context, dependencies.model || DEFAULT_IMAGE_MODEL, undefined, request.signal);
  if (!extraction.candidates.length) throw new HttpError(422, "No task was detected. Try a clearer screenshot or use Manual Entry.");
  // No task-write dependency: only explicit review submission creates tasks.
  return { extraction };
}
