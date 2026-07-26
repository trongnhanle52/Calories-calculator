import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, put } from "@vercel/blob";

/**
 * Where meal photos get stored:
 * - Any environment with a Vercel Blob store connected: uploads go to Vercel Blob. This
 *   is required in production because serverless functions have no persistent writable
 *   disk — a file saved during one request isn't guaranteed to still be there for a
 *   later request/instance.
 *   Connecting a store via the Vercel dashboard exposes credentials one of two ways —
 *   both are handled transparently by `put()`/`del()` from `@vercel/blob`, we just need
 *   to detect that *some* form of it is present:
 *     - Modern default: OIDC-based, short-lived tokens — `BLOB_STORE_ID` (+ the
 *       auto-rotated `VERCEL_OIDC_TOKEN`, which the SDK reads and refreshes itself).
 *     - Fallback/older style: a long-lived static `BLOB_READ_WRITE_TOKEN`.
 * - Local dev (neither set): falls back to `public/uploads/<userId>/<file>`, served
 *   directly by Next.js's static file handling — zero setup needed to develop.
 */
function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** Vercel sets this automatically on every deployment (Production, Preview, and dev via `vercel dev`). */
function isRunningOnVercel() {
  return Boolean(process.env.VERCEL);
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
  reqId?: string;
}): Promise<SavedMealImage> {
  const { buffer, extension, contentType, userId, reqId = "-" } = options;
  const tag = `[storage:${reqId}]`;
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;

  if (isBlobConfigured()) {
    const authMode = process.env.BLOB_READ_WRITE_TOKEN ? "read-write-token" : "oidc";
    console.log(`${tag} uploading to Vercel Blob (auth=${authMode}, bytes=${buffer.length})`);
    const startedAt = Date.now();
    try {
      const blob = await put(`meal-photos/${userId}/${filename}`, buffer, {
        access: "public",
        contentType,
      });
      console.log(`${tag} Vercel Blob upload OK in ${Date.now() - startedAt}ms -> ${blob.url}`);
      return { url: blob.url, remove: () => deleteMealImage(blob.url) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${tag} Vercel Blob upload FAILED after ${Date.now() - startedAt}ms: ${message}`, error);
      throw error;
    }
  }

  if (isRunningOnVercel()) {
    // The local-disk fallback below would fail anyway (Vercel's deployment filesystem is
    // read-only outside /tmp, so `public/uploads` can't be created) — but with a confusing
    // raw ENOENT error. Fail fast with a message that points straight at the real fix.
    console.error(`${tag} running on Vercel but no Blob credentials found (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN both unset)`);
    throw new Error(
      "Vercel Blob chưa được cấu hình: thiếu cả BLOB_STORE_ID lẫn BLOB_READ_WRITE_TOKEN. " +
        "Vào Vercel Dashboard → Storage → tạo hoặc kết nối Blob store cho project này (đảm bảo áp dụng " +
        "cho môi trường Production), rồi redeploy lại.",
    );
  }

  console.log(`${tag} saving to local disk (public/uploads/${userId}/${filename})`);
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
