import { redirect } from "next/navigation";
import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PhotoUploadForm } from "@/components/PhotoUploadForm";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [todayMeals, recentMeals] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: session.user.id, eatenAt: { gte: todayStart, lte: todayEnd } },
      include: { items: true },
    }),
    prisma.meal.findMany({
      where: { userId: session.user.id },
      orderBy: { eatenAt: "desc" },
      take: 3,
      include: { items: true },
    }),
  ]);

  const todayTotal = todayMeals.reduce(
    (sum, m) => sum + m.items.reduce((s, i) => s + i.calories, 0),
    0,
  );

  const firstName = session.user.name?.trim().split(" ").slice(-1)[0] ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-[0.25em] text-marigold">TRANG CHÍNH</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-cream sm:text-3xl">
          Chào {firstName}, hôm nay ăn gì rồi?
        </h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-lg bg-bg-raised px-4 py-3">
          <p className="text-xs text-muted">Calo hôm nay</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-cream">
            {Math.round(todayTotal).toLocaleString("vi-VN")}{" "}
            <span className="text-sm text-muted">kcal</span>
          </p>
        </div>
        <div className="rounded-lg bg-bg-raised px-4 py-3">
          <p className="text-xs text-muted">Số bữa hôm nay</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-cream">{todayMeals.length}</p>
        </div>
      </div>

      <PhotoUploadForm />

      {recentMeals.length > 0 && (
        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-cream">Gần đây</h2>
            <Link href="/history" className="text-sm font-medium text-marigold hover:underline">
              Xem tất cả →
            </Link>
          </div>
          <div className="space-y-3">
            {recentMeals.map((meal) => {
              const totalCalories = meal.items.reduce((s, i) => s + i.calories, 0);
              return (
                <Link
                  key={meal.id}
                  href={`/meals/${meal.id}`}
                  className="flex items-center justify-between rounded-lg bg-bg-raised px-4 py-3 transition-colors hover:bg-bg-raised-2"
                >
                  <div>
                    <p className="font-medium text-cream">{meal.name}</p>
                    <p className="text-xs text-muted">
                      {new Intl.DateTimeFormat("vi-VN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(meal.eatenAt)}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold text-marigold">
                    {Math.round(totalCalories).toLocaleString("vi-VN")} kcal
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
