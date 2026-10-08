export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export function imageFileError(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Choose a PNG, JPEG, or WebP screenshot.";
  if (file.size <= 0) return "The screenshot is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "Use a screenshot smaller than 3 MB. Crop it to the task.";
  return null;
}
