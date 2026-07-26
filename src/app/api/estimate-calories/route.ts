import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { estimateCalories } from "@/lib/ai/estimateCalories";
import { checkEstimateRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Cần nhập tên món ăn"),
  quantity: z.string().trim().optional().default(""),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  const rateLimit = checkEstimateRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    const message =
      rateLimit.reason === "day"
        ? "Bạn đã dùng hết lượt tự động tính calo hôm nay. Vui lòng nhập calo thủ công."
        : `Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`;
    return NextResponse.json(
      { error: message },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dữ liệu gửi lên không hợp lệ" },
      { status: 400 },
    );
  }

  const result = await estimateCalories(parsed.data.name, parsed.data.quantity);
  return NextResponse.json(result);
}
