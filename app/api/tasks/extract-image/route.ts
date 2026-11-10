import { requireUser, reply, apiError } from "@/lib/api";
import { databaseError } from "@/lib/task-store";
import { processImageExtraction, ExtractionLimitError } from "@/lib/image-extraction";
import { HttpError } from "@/lib/http";
import { reserveScreenshot } from "@/lib/ai-admission";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(request: Request) {
  try {
    return reply(await processImageExtraction(request, {
      enabled: process.env.SCREENSHOT_AI_ENABLED === "true", apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_IMAGE_MODEL, timezone: process.env.APP_TIMEZONE,
      authorize: async () => {
        const { supabase } = await requireUser();
        return { reserve: () => reserveScreenshot(supabase, request, process.env.AUTH_RECOVERY_SECRET), consumeSlot: async () => {
          const limit = await supabase.rpc("consume_import_slot");
          databaseError(limit.error);
          const slot = limit.data as { allowed?: unknown; retryAfter?: unknown } | null;
          if (!slot || typeof slot.allowed !== "boolean" || !Number.isInteger(slot.retryAfter) || Number(slot.retryAfter) < 1)
            throw new HttpError(503, "Screenshot rate limiting is unavailable.");
          return { allowed: slot.allowed, retryAfter: Number(slot.retryAfter) };
        } };
      },
    }));
  } catch (error) {
    if (error instanceof ExtractionLimitError) return reply({ error: error.message }, 429, { "Retry-After": String(error.retryAfter) });
    return apiError(error);
  }
}
