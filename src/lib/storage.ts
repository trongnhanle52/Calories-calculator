import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, put } from "@vercel/blob";

/**
 * Where meal photos get stored:
 * - Any environment with `BLOB_READ_WRITE_TOKEN` set (e.g. Vercel with a Blob store
 *   connected): uploads go to Vercel Blob. This is required in production because
 *   serverless functions have no persistent writable disk — a file saved during one
 *   request isn't guaranteed to still be there for a later request/instance.
 * - Local dev (no token configured): falls back to `public/uploads/<userId>/<file>`,
 *   served directly by Next.js's static file handling — zero setup needed to develop.
 */
function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export interface SavedMealImage {
  url: string;
  /** Best-effort delete, e.g. when a photo turns out to have no food in it after all. */
  remove: () => Promise<void>;
}

export async function saveMealImage(options: {
  buffer: Buffer;
  extension: string;
  contentType: string;
  userId: string;
}): Promise<SavedMealImage> {
  const { buffer, extension, contentType, userId } = options;
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;

  if (isBlobConfigured()) {
    const blob = await put(`meal-photos/${userId}/${filename}`, buffer, {
      access: "public",
      contentType,
    });
    return { url: blob.url, remove: () => deleteMealImage(blob.url) };
  }

  const userDir = path.join(process.cwd(), "public", "uploads", userId);
  await mkdir(userDir, { recursive: true });
  const absolutePath = path.join(userDir, filename);
  await writeFile(absolutePath, buffer);
  const url = `/uploads/${userId}/${filename}`;
  return { url, remove: () => deleteMealImage(url) };
}

/**
 * Deletes a previously-saved meal photo by its stored URL (works for both storage
 * backends — dispatches based on the URL's own shape, not the current env config, so
 * older photos saved before/after a storage-mode switch still delete correctly).
 * Ignores missing files/errors since this is always a best-effort cleanup.
 */
export async function deleteMealImage(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  if (/^https?:\/\//.test(imageUrl)) {
    await del(imageUrl).catch(() => {});
    return;
  }
  const absolutePath = path.join(process.cwd(), "public", imageUrl.replace(/^\/+/, ""));
  await unlink(absolutePath).catch(() => {});
}
