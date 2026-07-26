/**
 * Client-side image compression before uploading to `/api/analyze`.
 *
 * Why: Vercel Serverless Functions reject request bodies over 4.5MB at the platform
 * level (before our code even runs), returning a non-JSON error page. Real photos
 * straight from a phone camera are routinely 3-10MB, so without this the "Phân tích
 * ảnh" button would fail on production with a generic "Không thể kết nối máy chủ"
 * error while working fine with small test images locally. Downscaling also makes
 * uploads faster and Gemini calls cheaper — food recognition doesn't need full
 * camera resolution.
 */
const MAX_DIMENSION = 1600; // longest side, in px — plenty of detail for food recognition
const JPEG_QUALITY = 0.82;
const SKIP_COMPRESSION_BELOW = 1.5 * 1024 * 1024; // already-small files aren't worth re-encoding

export async function compressImageFile(file: File): Promise<File> {
  if (file.size <= SKIP_COMPRESSION_BELOW) return file;

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation: "from-image"` makes sure photos taken in portrait mode
    // (which store EXIF rotation metadata rather than physically rotated pixels)
    // don't come out sideways after resizing.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Very old/unsupported browser — fall back to uploading the original and let
    // the server-side size check (and, worst case, Vercel's own limit) handle it.
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.round(bitmap.width * scale);
  const targetHeight = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
