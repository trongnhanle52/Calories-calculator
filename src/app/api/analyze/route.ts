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
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(session.user.id);
    if (!rateLimit.allowed) {
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
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Không tìm thấy ảnh trong yêu cầu" }, { status: 400 });
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Định dạng ảnh không được hỗ trợ. Vui lòng dùng JPG, PNG hoặc WEBP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ảnh quá lớn (tối đa 4MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { url: imageUrl, remove: removeImage } = await saveMealImage({
      buffer,
      extension,
      contentType: file.type,
      userId: session.user.id,
    });

    const base64DataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await analyzeFoodImage(base64DataUrl);

    if (result.noFoodDetected) {
      // Nothing to review or save for this photo — remove the upload instead of leaving it orphaned.
      await removeImage();
      return NextResponse.json({
        imageUrl: null,
        items: [],
        isMock: false,
        noFoodDetected: true,
      });
    }

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
    console.error("[/api/analyze] unexpected error", error);
    return NextResponse.json(
      { error: "Có lỗi xảy ra khi phân tích ảnh. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
