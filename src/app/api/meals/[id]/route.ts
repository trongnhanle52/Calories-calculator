import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteMealImage } from "@/lib/storage";

const foodItemSchema = z.object({
  name: z.string().trim().min(1, "Tên món ăn không được để trống"),
  calories: z.coerce.number().min(0, "Calo không được âm"),
  quantity: z.string().trim().optional().default(""),
});

const mealUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  note: z.string().trim().optional().nullable(),
  eatenAt: z.string().datetime().optional(),
  items: z.array(foodItemSchema).min(1, "Cần có ít nhất một món ăn"),
});

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedMeal(mealId: string, userId: string) {
  const meal = await prisma.meal.findUnique({
    where: { id: mealId },
    include: { items: true },
  });
  if (!meal || meal.userId !== userId) return null;
  return meal;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const meal = await getOwnedMeal(id, session.user.id);
  if (!meal) {
    return NextResponse.json({ error: "Không tìm thấy bữa ăn" }, { status: 404 });
  }

  return NextResponse.json({
    meal: { ...meal, totalCalories: meal.items.reduce((sum, i) => sum + i.calories, 0) },
  });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedMeal(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy bữa ăn" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = mealUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, note, eatenAt, items } = parsed.data;

  const meal = await prisma.$transaction(async (tx) => {
    await tx.foodItem.deleteMany({ where: { mealId: id } });
    return tx.meal.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(note !== undefined ? { note: note || null } : {}),
        ...(eatenAt !== undefined ? { eatenAt: new Date(eatenAt) } : {}),
        items: {
          create: items.map((item) => ({
            name: item.name,
            calories: item.calories,
            quantity: item.quantity || null,
          })),
        },
      },
      include: { items: true },
    });
  });

  return NextResponse.json({
    meal: { ...meal, totalCalories: meal.items.reduce((sum, i) => sum + i.calories, 0) },
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const meal = await getOwnedMeal(id, session.user.id);
  if (!meal) {
    return NextResponse.json({ error: "Không tìm thấy bữa ăn" }, { status: 404 });
  }

  await prisma.meal.delete({ where: { id } });

  // Best-effort cleanup of the uploaded photo; ignore errors (e.g. file already missing).
  void deleteMealImage(meal.imageUrl);

  return NextResponse.json({ success: true });
}
