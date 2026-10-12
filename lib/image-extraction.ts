import { assertSameOrigin, HttpError } from "./http";
import { readImageUpload, normalizeImage } from "./image-upload";
import { DEFAULT_IMAGE_MODEL, extractWithOpenAI } from "./openai-image";
import { referenceDay, type Extraction } from "./assignment-draft";
type Access = { consumeSlot: () => Promise<{ allowed: boolean; retryAfter: number }> };
export class ExtractionLimitError extends HttpError {
  constructor(public retryAfter: number) { super(429, "Screenshot/import limit reached. Try again in a few minutes or use Manual Entry."); }
}
export async function processImageExtraction(request: Request, dependencies: {
  authorize: () => Promise<Access>; apiKey?: string; model?: string; timezone?: string; now?: Date; extract?: typeof extractWithOpenAI;
}): Promise<{ extraction: Extraction }> {
  assertSameOrigin(request);
  const access = await dependencies.authorize();
  if (!dependencies.apiKey?.trim()) throw new HttpError(503, "Screenshot analysis is not configured. Set OPENAI_API_KEY on the server; Manual Entry is still available.");
  const file = await readImageUpload(request);
  const slot = await access.consumeSlot();
  if (!slot.allowed) throw new ExtractionLimitError(slot.retryAfter);
  const pixels = await normalizeImage(file);
  const timezone = dependencies.timezone || "America/New_York";
  const context = { referenceDate: referenceDay(dependencies.now || new Date(), timezone), timezone };
  const extraction = await (dependencies.extract || extractWithOpenAI)(pixels, dependencies.apiKey, context, dependencies.model || DEFAULT_IMAGE_MODEL);
  if (!extraction.candidates.length) throw new HttpError(422, "No task was detected. Try a clearer screenshot or use Manual Entry.");
  // No task-write dependency: only explicit review submission creates tasks.
  return { extraction };
}
