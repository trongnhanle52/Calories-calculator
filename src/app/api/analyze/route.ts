import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeFoodImage } from "@/lib/ai/analyzeFood";
import { checkRateLimit } from "@/lib/rateLimit";
import { saveMealImage } from "@/lib/storage";

export const runtime = "nodejs";
// Gemini calls occasionally take longer than the default; give the function room
// (300s is the max allowed on Vercel's Hobby plan and is safely within Pro's limit too).
export const maxDuration = 300;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Vercel Serverless Functions hard-reject request bodies over 4.5MB at the platform
// level (returning a non-JSON error the client can't parse). The client already
// compresses images before upload (see src/lib/compressImage.ts), so this is a
// safety margin below that ceiling for cases where compression is skipped/unsupported.
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export async function POST(request: Request) {
  // Correlates this request's logs across route.ts / storage.ts / analyzeFood.ts, and lets the
  // client's own console logs be matched to server logs if the client sends the same id back
  // (see PhotoUploadForm.tsx). Falls back to a fresh id if the client didn't send one.
  const reqId = request.headers.get("x-request-id") || randomUUID().slice(0, 8);
  const tag = `[analyze:${reqId}]`;
  const requestStartedAt = Date.now();
  const elapsed = () => Date.now() - requestStartedAt;

  console.log(`${tag} incoming request, content-length=${request.headers.get("content-length") ?? "?"}`);

  try {
    const session = await auth();
    console.log(`${tag} auth() resolved in ${elapsed()}ms, userId=${session?.user?.id ?? "none"}`);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(session.user.id);
    if (!rateLimit.allowed) {
      console.warn(`${tag} rate limited (reason=${rateLimit.reason})`);
      const message =
        rateLimit.reason === "day"
          ? "Bạn đã dùng hết lượt phân tích ảnh hôm nay. Vui lòng thử lại vào ngày mai."
          : `Bạn đang gửi ảnh quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`;
      return NextResponse.json(
        { error: message },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
      );
    }

    const formData = await request.formData();
    console.log(`${tag} formData parsed in ${elapsed()}ms`);
    const file = formData.get("image");

    if (!(file instanceof File)) {
      console.warn(`${tag} no image file found in form data`);
      return NextResponse.json({ error: "Không tìm thấy ảnh trong yêu cầu" }, { status: 400 });
    }
    console.log(`${tag} file received: name="${file.name}" type=${file.type} size=${file.size}B`);

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      console.warn(`${tag} unsupported file type: ${file.type}`);
      return NextResponse.json(
        { error: "Định dạng ảnh không được hỗ trợ. Vui lòng dùng JPG, PNG hoặc WEBP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      console.warn(`${tag} file too large: ${file.size}B > ${MAX_FILE_SIZE}B`);
      return NextResponse.json({ error: "Ảnh quá lớn (tối đa 4MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { url: imageUrl, remove: removeImage } = await saveMealImage({
      buffer,
      extension,
      contentType: file.type,
      userId: session.user.id,
      reqId,
    });
    console.log(`${tag} image saved (total ${elapsed()}ms so far) -> ${imageUrl}`);

    const base64DataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await analyzeFoodImage(base64DataUrl, reqId);
    console.log(
      `${tag} analysis complete (total ${elapsed()}ms) isMock=${result.isMock} noFoodDetected=${result.noFoodDetected} items=${result.items.length}`,
    );

    if (result.noFoodDetected) {
      // Nothing to review or save for this photo — remove the upload instead of leaving it orphaned.
      await removeImage();
      console.log(`${tag} responding: no food detected (total ${elapsed()}ms)`);
      return NextResponse.json({
        imageUrl: null,
        items: [],
        isMock: false,
        noFoodDetected: true,
      });
    }

    console.log(`${tag} responding: success (total ${elapsed()}ms)`);
    return NextResponse.json({
      imageUrl,
      items: result.items,
      isMock: result.isMock,
      noFoodDetected: false,
    });
  } catch (error) {
    // Make sure the client always gets valid JSON back, even on an unexpected
    // failure (Blob storage error, Gemini SDK throwing, etc.) — otherwise `res.json()`
    // on the client throws and surfaces as a generic "can't connect to server" message.
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${tag} unexpected error after ${elapsed()}ms (${name}: ${message})`, error);
    return NextResponse.json(
      { error: "Có lỗi xảy ra khi phân tích ảnh. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
