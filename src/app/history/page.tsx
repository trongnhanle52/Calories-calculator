import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { HistoryList } from "@/components/HistoryList";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const meals = await prisma.meal.findMany({
    where: { userId: session.user.id },
    orderBy: { eatenAt: "desc" },
    include: { items: true },
  });

  const mealsWithTotal = meals.map((m) => ({
    id: m.id,
    name: m.name,
    imageUrl: m.imageUrl,
    eatenAt: m.eatenAt.toISOString(),
    totalCalories: m.items.reduce((s, i) => s + i.calories, 0),
    itemCount: m.items.length,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-[0.25em] text-marigold">LỊCH SỬ</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-cream sm:text-3xl">
          Các bữa ăn đã lưu
        </h1>
      </div>
      <HistoryList meals={mealsWithTotal} />
    </div>
  );
}
