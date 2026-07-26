import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const foodItemSchema = z.object({
  name: z.string().trim().min(1, "Tên món ăn không được để trống"),
  calories: z.coerce.number().min(0, "Calo không được âm"),
  quantity: z.string().trim().optional().default(""),
});

const mealSchema = z.object({
  name: z.string().trim().min(1).default("Bữa ăn"),
  imageUrl: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  eatenAt: z.string().datetime().optional(),
  items: z.array(foodItemSchema).min(1, "Cần có ít nhất một món ăn"),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 100) : undefined;

  const meals = await prisma.meal.findMany({
    where: { userId: session.user.id },
    orderBy: { eatenAt: "desc" },
    take: limit,
    include: { items: true },
  });

  const withTotals = meals.map((meal) => ({
    ...meal,
    totalCalories: meal.items.reduce((sum, item) => sum + item.calories, 0),
  }));

  return NextResponse.json({ meals: withTotals });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = mealSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, imageUrl, note, eatenAt, items } = parsed.data;

  const meal = await prisma.meal.create({
    data: {
      userId: session.user.id,
      name,
      imageUrl: imageUrl || null,
      note: note || null,
      eatenAt: eatenAt ? new Date(eatenAt) : new Date(),
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

  return NextResponse.json(
    { meal: { ...meal, totalCalories: meal.items.reduce((sum, i) => sum + i.calories, 0) } },
    { status: 201 },
  );
}
