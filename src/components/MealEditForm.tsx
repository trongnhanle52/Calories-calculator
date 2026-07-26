"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Ticket, TicketDivider } from "@/components/Ticket";
import { useAutoEstimateCalories, type AutoEstimateItem } from "@/hooks/useAutoEstimateCalories";

type Item = AutoEstimateItem;

interface MealData {
  id: string;
  name: string;
  imageUrl: string | null;
  note: string;
  eatenAt: string;
  items: Item[];
}

function toLocalDatetimeInputValue(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

let tempIdCounter = 0;
function nextId() {
  tempIdCounter += 1;
  return `new-${Date.now()}-${tempIdCounter}`;
}

export function MealEditForm({ meal }: { meal: MealData }) {
  const router = useRouter();
  const [name, setName] = useState(meal.name);
  const [note, setNote] = useState(meal.note);
  const [eatenAt, setEatenAt] = useState(() => toLocalDatetimeInputValue(meal.eatenAt));
  // Items loaded from a saved meal already have a real value — mark them so auto-estimate
  // doesn't overwrite them on load; editing a row's name/quantity later flips it back to
  // true (see the input onChange handlers below), and rows added via addItem() opt in
  // straight away.
  const [items, setItems] = useState<Item[]>(() => meal.items.map((it) => ({ ...it, autoCalories: false })));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    setSavedMessage(null);
  }
  const { scheduleAutoEstimate, cancelAutoEstimate } = useAutoEstimateCalories(items, updateItem);

  function removeItem(id: string) {
    cancelAutoEstimate(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSavedMessage(null);
  }
  function addItem() {
    setItems((prev) => [...prev, { id: nextId(), name: "", calories: 0, quantity: "", autoCalories: true }]);
  }

  const total = items.reduce((sum, it) => sum + (Number(it.calories) || 0), 0);
  const canSave = items.length > 0 && items.every((it) => it.name.trim().length > 0);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(`/api/meals/${meal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          note,
          eatenAt: new Date(eatenAt).toISOString(),
          items: items.map((it) => ({ name: it.name, calories: it.calories, quantity: it.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Lưu thất bại. Vui lòng thử lại.");
        return;
      }
      setSavedMessage("Đã lưu thay đổi.");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Xóa bữa ăn này? Hành động này không thể hoàn tác.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/meals/${meal.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/history");
        router.refresh();
        return;
      }
      const data = await res.json();
      setError(data.error ?? "Xóa thất bại.");
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link href="/history" className="text-sm font-medium text-muted hover:text-cream">
        ← Quay lại lịch sử
      </Link>

      {meal.imageUrl && (
        <div className="relative mt-4 h-56 w-full overflow-hidden rounded-lg bg-black/20 sm:h-72">
          <Image src={meal.imageUrl} alt={meal.name} fill className="object-cover" unoptimized />
        </div>
      )}

      <div className="mt-4">
        <Ticket>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-mono text-[11px] font-medium tracking-[0.25em] text-muted-ink">
                PHIẾU CALO
              </p>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSavedMessage(null);
                }}
                className="mt-1 w-full bg-transparent font-display text-lg font-extrabold text-ink outline-none focus:border-b focus:border-dashed focus:border-ink/40"
                placeholder="Tên bữa ăn"
              />
            </div>
            <input
              type="datetime-local"
              value={eatenAt}
              onChange={(e) => {
                setEatenAt(e.target.value);
                setSavedMessage(null);
              }}
              className="shrink-0 rounded-md border border-ink/15 bg-white/60 px-2 py-1 font-mono text-xs text-ink"
            />
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    value={item.name}
                    onChange={(e) => {
                      // Editing the name means the food itself changed — opt back into
                      // auto-estimate even if this row already had a real saved value.
                      updateItem(item.id, { name: e.target.value, autoCalories: true });
                      scheduleAutoEstimate(item.id);
                    }}
                    placeholder="Tên món ăn"
                    className={`w-full border-b border-dotted bg-transparent py-0.5 text-sm font-medium text-ink outline-none focus:border-ink ${
                      item.foodNotFound ? "border-chili/60" : "border-muted-ink/50"
                    }`}
                  />
                  <input
                    value={item.quantity}
                    onChange={(e) => {
                      // Same idea: a changed portion size means the calo total needs
                      // recalculating, even for a row that already had a real value.
                      updateItem(item.id, { quantity: e.target.value, autoCalories: true });
                      scheduleAutoEstimate(item.id);
                    }}
                    placeholder="Khẩu phần, vd 1 chén (150g)"
                    className="mt-0.5 w-full bg-transparent text-xs text-muted-ink outline-none"
                  />
                  {item.foodNotFound && (
                    <p className="mt-1 text-[11px] text-chili">
                      ⚠️ Không tìm thấy món ăn này. Kiểm tra lại tên hoặc nhập calo thủ công.
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  value={item.calories}
                  disabled={item.estimating}
                  onChange={(e) => {
                    cancelAutoEstimate(item.id);
                    updateItem(item.id, {
                      calories: Number(e.target.value),
                      autoCalories: false,
                      foodNotFound: false,
                    });
                  }}
                  aria-label={`Lượng calo của ${item.name || "món ăn"}`}
                  className="w-20 shrink-0 rounded-md border border-ink/15 bg-white/60 px-2 py-1 text-right font-mono text-sm text-ink disabled:opacity-60"
                />
                <span className="w-14 shrink-0 font-mono text-xs text-muted-ink">
                  {item.estimating ? <span className="animate-pulse text-herb">đang tính…</span> : "kcal"}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Xóa ${item.name || "món ăn"}`}
                  className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-sm text-chili/70 hover:bg-chili/10 hover:text-chili"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 cursor-pointer text-xs font-semibold text-herb hover:underline"
          >
            + Thêm món ăn
          </button>
          {items.some((it) => it.autoCalories) && (
            <p className="mt-1 text-[11px] text-muted-ink">
              💡 Nhập tên món và khẩu phần — AI sẽ tự ước tính lượng calo giúp bạn (vẫn có thể sửa lại).
            </p>
          )}

          <TicketDivider />

          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold tracking-wide text-ink">TỔNG CỘNG</span>
            <span className="font-display text-2xl font-black tabular-nums text-marigold-ink">
              {Math.round(total).toLocaleString("vi-VN")}{" "}
              <span className="text-sm font-semibold">kcal</span>
            </span>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-muted-ink">Ghi chú (tuỳ chọn)</label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSavedMessage(null);
              }}
              rows={2}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus:border-marigold focus:outline-none focus:ring-2 focus:ring-marigold/40"
              placeholder="Ví dụ: ăn ở quán gần công ty"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-chili/30 bg-chili/10 px-3 py-2 text-sm text-chili">
              {error}
            </p>
          )}
          {savedMessage && (
            <p className="mt-4 rounded-md border border-herb/30 bg-herb/10 px-3 py-2 text-sm text-herb">
              {savedMessage}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="cursor-pointer rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer rounded-md border border-chili/40 px-4 py-2 text-sm font-semibold text-chili transition-colors hover:bg-chili/10 disabled:opacity-60"
            >
              {deleting ? "Đang xóa…" : "Xóa bữa ăn"}
            </button>
          </div>
        </Ticket>
      </div>
    </div>
  );
}
