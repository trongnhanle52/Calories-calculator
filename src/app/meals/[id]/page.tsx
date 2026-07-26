import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MealEditForm } from "@/components/MealEditForm";

export default async function MealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const meal = await prisma.meal.findUnique({ where: { id }, include: { items: true } });

  if (!meal || meal.userId !== session.user.id) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <MealEditForm
        meal={{
          id: meal.id,
          name: meal.name,
          imageUrl: meal.imageUrl,
          note: meal.note ?? "",
          eatenAt: meal.eatenAt.toISOString(),
          items: meal.items.map((it) => ({
            id: it.id,
            name: it.name,
            calories: it.calories,
            quantity: it.quantity ?? "",
          })),
        }}
      />
    </div>
  );
}
