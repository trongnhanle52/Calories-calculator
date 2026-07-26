"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface MealSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  eatenAt: string;
  totalCalories: number;
  itemCount: number;
}

export function HistoryList({ meals: initialMeals }: { meals: MealSummary[] }) {
  const router = useRouter();
  const [meals, setMeals] = useState(initialMeals);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xóa "${name}" khỏi lịch sử? Hành động này không thể hoàn tác.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMeals((prev) => prev.filter((m) => m.id !== id));
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (meals.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-cream/20 px-6 py-16 text-center">
        <p className="text-4xl">🧾</p>
        <p className="mt-4 font-display text-lg font-bold text-cream">
          Chưa có bữa ăn nào được ghi lại
        </p>
        <p className="mt-1 text-sm text-muted">
          Chụp bữa ăn đầu tiên của bạn để bắt đầu theo dõi.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink"
        >
          Chụp bữa ăn
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meals.map((meal) => (
        <div
          key={meal.id}
          className="flex items-center gap-3 rounded-lg bg-bg-raised px-3 py-3 sm:px-4"
        >
          <Link href={`/meals/${meal.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-black/30">
              {meal.imageUrl ? (
                <Image
                  src={meal.imageUrl}
                  alt={meal.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-lg">🍽️</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-cream">{meal.name}</p>
              <p className="text-xs text-muted">
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(meal.eatenAt))}
                {" · "}
                {meal.itemCount} món
              </p>
            </div>
          </Link>
          <p className="shrink-0 font-mono text-sm font-semibold text-marigold">
            {Math.round(meal.totalCalories).toLocaleString("vi-VN")} kcal
          </p>
          <button
            onClick={() => handleDelete(meal.id, meal.name)}
            disabled={deletingId === meal.id}
            aria-label={`Xóa ${meal.name}`}
            className="shrink-0 cursor-pointer rounded-md px-2 py-1.5 text-chili/70 hover:bg-chili/10 hover:text-chili disabled:opacity-50"
          >
            {deletingId === meal.id ? "…" : "🗑"}
          </button>
        </div>
      ))}
    </div>
  );
}
