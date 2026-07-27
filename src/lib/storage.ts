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
 *   Connecting a store via the Vercel dashboard exposes credentials one of a few ways,
 *   all resolved explicitly below (see `resolveBlobAuthOptions()`) rather than left to the
 *   SDK's own env lookup, which only recognizes the exact default names:
 *     - A long-lived static read-write token, normally named `BLOB_READ_WRITE_TOKEN`.
 *     - Modern/OIDC default: `BLOB_STORE_ID` + Vercel's auto-rotated `VERCEL_OIDC_TOKEN`
 *       (read internally by the SDK — we never see it directly).
 *     - Gotcha confirmed in production: once a project already has one store connected
 *       under the default name, connecting a *second* store makes Vercel provision its
 *       credentials under a custom prefix instead (e.g. `NEWSTORENAME_READ_WRITE_TOKEN` /
 *       `NEWSTORENAME_STORE_ID`), so the exact env var name isn't guaranteed.
 * - Local dev (nothing set): falls back to `public/uploads/<userId>/<file>`, served
 *   directly by Next.js's static file handling — zero setup needed to develop.
 */
function resolveBlobToken(): { token: string; source: string } | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN, source: "BLOB_READ_WRITE_TOKEN" };
  }
  // Fall back to scanning for a differently-prefixed read-write token (see comment above)
  // so a store connected under a custom prefix still works without manually renaming the
  // env var in the Vercel dashboard.
  const fallbackKey = Object.keys(process.env).find((key) => /_READ_WRITE_TOKEN$/.test(key));
  if (fallbackKey) {
    return { token: process.env[fallbackKey] as string, source: fallbackKey };
  }
  return undefined;
}

/** Same idea as `resolveBlobToken()`, but for the OIDC-mode store id (only used as a
 * fallback when no read-write token is found anywhere — see `resolveBlobAuthOptions()`). */
function resolveBlobStoreId(): { storeId: string; source: string } | undefined {
  if (process.env.BLOB_STORE_ID) {
    return { storeId: process.env.BLOB_STORE_ID, source: "BLOB_STORE_ID" };
  }
  const fallbackKey = Object.keys(process.env).find((key) => /_STORE_ID$/.test(key));
  if (fallbackKey) {
    return { storeId: process.env[fallbackKey] as string, source: fallbackKey };
  }
  return undefined;
}

function isBlobConfigured() {
  return Boolean(resolveBlobToken() || resolveBlobStoreId());
}

/**
 * Builds the auth option(s) to pass explicitly to `put()`/`del()`, plus a short label for
 * logging. We resolve these ourselves instead of relying on the SDK's own env lookup,
 * which only recognizes the exact `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` names — not
 * the custom-prefixed names Vercel provisions once a project has more than one store
 * connected (see file doc comment above).
 * Confirmed directly from `@vercel/blob`'s installed source (`resolveBlobAuth()`): a
 * passed-in `token` always wins immediately, without even looking at `storeId` or OIDC —
 * and the store id is parsed straight out of the token string itself. So `storeId` here
 * is only relevant as a fallback for pure-OIDC setups (no read-write token at all).
 */
function resolveBlobAuthOptions(): { options: { token?: string; storeId?: string }; label: string } {
  const resolvedToken = resolveBlobToken();
  if (resolvedToken) {
    return { options: { token: resolvedToken.token }, label: `token:${resolvedToken.source}` };
  }
  const resolvedStoreId = resolveBlobStoreId();
  if (resolvedStoreId) {
    return { options: { storeId: resolvedStoreId.storeId }, label: `oidc:${resolvedStoreId.source}` };
  }
  return { options: {}, label: "oidc-implicit" };
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
    const { options: authOptions, label: authMode } = resolveBlobAuthOptions();
    console.log(`${tag} uploading to Vercel Blob (auth=${authMode}, bytes=${buffer.length})`);
    const startedAt = Date.now();
    try {
      const blob = await put(`meal-photos/${userId}/${filename}`, buffer, {
        access: "public",
        contentType,
        ...authOptions,
      });
      console.log(`${tag} Vercel Blob upload OK in ${Date.now() - startedAt}ms -> ${blob.url}`);
      return { url: blob.url, remove: () => deleteMealImage(blob.url) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${tag} Vercel Blob upload FAILED after ${Date.now() - startedAt}ms: ${message}`, error);
      if (/private access|private store/i.test(message)) {
        // The connected store was created with "Private" access mode, which can't be
        // changed after creation — a new store must be created with "Public" access
        // (appropriate here since filenames are unguessable random UUIDs and nothing
        // sensitive is stored).
        throw new Error(
          "Vercel Blob store hiện tại được tạo ở chế độ Private (không thể đổi sau khi tạo). " +
            "Vào Vercel Dashboard → Storage → tạo Blob store MỚI, chọn access = Public → " +
            "Connect store đó cho project này (thay cho store Private cũ) → redeploy lại.",
        );
      }
      throw error;
    }
  }

  if (isRunningOnVercel()) {
    // The local-disk fallback below would fail anyway (Vercel's deployment filesystem is
    // read-only outside /tmp, so `public/uploads` can't be created) — but with a confusing
    // raw ENOENT error. Fail fast with a message that points straight at the real fix.
    console.error(`${tag} running on Vercel but no Blob credentials found (no *_READ_WRITE_TOKEN or *_STORE_ID)`);
    throw new Error(
      "Vercel Blob chưa được cấu hình: không tìm thấy biến nào kết thúc bằng _READ_WRITE_TOKEN hay _STORE_ID. " +
        "Vào Vercel Dashboard → Storage → tạo hoặc kết nối Blob store cho project này " +
        "(đảm bảo áp dụng cho môi trường Production), rồi redeploy lại.",
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
    const { options: authOptions } = resolveBlobAuthOptions();
    await del(imageUrl, authOptions).catch(() => {});
    return;
  }
  const absolutePath = path.join(process.cwd(), "public", imageUrl.replace(/^\/+/, ""));
  await unlink(absolutePath).catch(() => {});
}
