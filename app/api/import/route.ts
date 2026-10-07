import { allowedFeedUrl, fetchFeed } from "@/lib/feed-fetch";
import { parseFeed } from "@/lib/ics";
import { requireUser, reply, apiError } from "@/lib/api";
import { assertSameOrigin, HttpError, readJson } from "@/lib/http";
import { databaseError, toTaskRow } from "@/lib/task-store";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const body = await readJson(request, 8192);
    if (!body || typeof body !== "object" || !("url" in body) || !("source" in body) ||
      typeof body.url !== "string" || body.url.length > 4096 || (body.source !== "Canvas" && body.source !== "Gradescope")) {
      throw new HttpError(400, "Provide a calendar feed URL and valid source.");
    }
    const url = allowedFeedUrl(body.url);
    const limit = await supabase.rpc("consume_import_slot");
    databaseError(limit.error);
    const allowance = limit.data as { allowed: boolean; retryAfter: number } | null;
    if (!allowance || typeof allowance.allowed !== "boolean") throw new HttpError(503, "Feed import rate limiting is unavailable.");
    if (!allowance.allowed) return reply({ error: "Import limit reached. Try again in a few minutes." }, 429, { "Retry-After": String(allowance.retryAfter) });
    const content = await fetchFeed(url);
    const result = await parseFeed(content, url.href, body.source);
    const unique = [...new Map(result.tasks.map(task => [task.id, task])).values()];
    const saved = await supabase.rpc("import_tasks", { p_tasks: unique.map(task => toTaskRow(task, user.id)) as Json });
    databaseError(saved.error);
    return reply({ count: saved.data, warnings: result.warnings });
  } catch (error) {
    // Do not log private URLs or return low-level errors that could include tokens.
    const known = ["Enter a valid", "Use an HTTPS", "The feed hostname", "The feed did not",
      "Calendar feeds", "Feed download", "This URL did not", "Feed contains"];
    if (error instanceof Error && known.some(prefix => error.message.startsWith(prefix))) return reply({ error: error.message }, 400);
    return apiError(error);
  }
}
