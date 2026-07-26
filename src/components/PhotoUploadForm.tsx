"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Ticket, TicketDivider } from "@/components/Ticket";
import { NoFoodDialog } from "@/components/NoFoodDialog";
import { useAutoEstimateCalories, type AutoEstimateItem } from "@/hooks/useAutoEstimateCalories";
import { compressImageFile } from "@/lib/compressImage";

type EditableItem = AutoEstimateItem;

function toLocalDatetimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

let tempIdCounter = 0;
function nextId() {
  tempIdCounter += 1;
  return `item-${Date.now()}-${tempIdCounter}`;
}

export function PhotoUploadForm() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparingFile, setPreparingFile] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [items, setItems] = useState<EditableItem[] | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [noFoodDetected, setNoFoodDetected] = useState(false);

  const [mealName, setMealName] = useState("Bữa ăn");
  const [eatenAt, setEatenAt] = useState(() => toLocalDatetimeInputValue(new Date()));
  const [note, setNote] = useState("");

  const { scheduleAutoEstimate, cancelAutoEstimate, resetAutoEstimateState } = useAutoEstimateCalories(
    items ?? [],
    updateItem,
  );

  function resetResult() {
    resetAutoEstimateState();
    setItems(null);
    setImageUrl(null);
    setError(null);
    setSavedMessage(null);
    setNoFoodDetected(false);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    resetResult();
    setPreparingFile(true);
    try {
      // Downscale/compress before storing — real camera photos are routinely 3-10MB,
      // which exceeds Vercel's 4.5MB function request limit (see compressImage.ts).
      const compressed = await compressImageFile(f);
      setFile(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
    } finally {
      setPreparingFile(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreviewUrl(null);
    resetResult();
    setMealName("Bữa ăn");
    setNote("");
    setEatenAt(toLocalDatetimeInputValue(new Date()));
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  async function handleAnalyze() {
    if (!file) return;
    // A short id to correlate this attempt's browser console logs with the server-side
    // logs for the same request (route.ts logs the same id if this header is present).
    const reqId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : `${Date.now()}`;
    const logTag = `[analyze:${reqId}]`;
    const startedAt = performance.now();

    setAnalyzing(true);
    setError(null);
    setSavedMessage(null);
    setNoFoodDetected(false);

    // Guards against the request hanging forever with zero feedback (e.g. a stalled network
    // path, or the server getting stuck) — without this, "click Phân tích and nothing ever
    // happens" would be invisible in both the UI and the logs. Set comfortably above the
    // server's own Gemini timeout (55s, see analyzeFood.ts) plus save/auth overhead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65_000);

    console.log(`${logTag} start — file="${file.name}" type=${file.type} size=${file.size}B`);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        headers: { "x-request-id": reqId },
        signal: controller.signal,
      });
      console.log(`${logTag} response received in ${Math.round(performance.now() - startedAt)}ms — HTTP ${res.status}`);
      const data = await res.json();
      if (!res.ok) {
        console.warn(`${logTag} server returned an error:`, data.error);
        setError(data.error ?? "Phân tích thất bại. Vui lòng thử lại.");
        return;
      }
      if (data.noFoodDetected) {
        console.log(`${logTag} no food detected in photo`);
        setNoFoodDetected(true);
        setItems([]);
        setImageUrl(null);
        setIsMock(false);
        return;
      }
      const analyzedItems = data.items as { name: string; calories: number; quantity: string }[];
      console.log(`${logTag} success — ${analyzedItems.length} item(s), isMock=${Boolean(data.isMock)}`);
      setItems(
        analyzedItems.map((it) => ({
          id: nextId(),
          name: it.name,
          quantity: it.quantity ?? "",
          calories: Math.round(it.calories) || 0,
          // Already has a real AI-estimated value — don't auto-overwrite on load, but
          // editing the name/quantity later flips this back to true (see the input
          // onChange handlers below).
          autoCalories: false,
        })),
      );
      setImageUrl(data.imageUrl as string);
      setIsMock(Boolean(data.isMock));
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`${logTag} client-side timeout — no response after ${elapsedMs}ms`);
        setError("Quá thời gian chờ phản hồi từ máy chủ. Vui lòng thử lại.");
      } else {
        console.error(`${logTag} network/parse error after ${elapsedMs}ms:`, err);
        setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
      }
    } finally {
      clearTimeout(timeoutId);
      setAnalyzing(false);
    }
  }

  function updateItem(id: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev?.map((it) => (it.id === id ? { ...it, ...patch } : it)) ?? null);
  }

  function removeItem(id: string) {
    cancelAutoEstimate(id);
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? null);
  }

  function addItem() {
    setItems((prev) => [
      ...(prev ?? []),
      { id: nextId(), name: "", quantity: "", calories: 0, autoCalories: true },
    ]);
  }

  const total = items?.reduce((sum, it) => sum + (Number(it.calories) || 0), 0) ?? 0;
  const canSave = !!items && items.length > 0 && items.every((it) => it.name.trim().length > 0);

  async function handleSave() {
    if (!items || items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mealName || "Bữa ăn",
          imageUrl,
          note,
          eatenAt: new Date(eatenAt).toISOString(),
          items: items.map((it) => ({
            name: it.name,
            calories: it.calories,
            quantity: it.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Lưu thất bại. Vui lòng thử lại.");
        return;
      }
      setSavedMessage("Đã lưu bữa ăn vào lịch sử của bạn.");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1: capture / choose photo */}
      <div className="rounded-lg border-2 border-dashed border-cream/25 bg-bg-raised/40 p-5 sm:p-6">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelected}
        />

        {preparingFile ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-marigold/15 text-2xl animate-pulse">
              🖼️
            </div>
            <p className="text-sm text-muted">Đang xử lý ảnh…</p>
          </div>
        ) : !previewUrl ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-marigold/15 text-2xl">
              🍽️
            </div>
            <div>
              <p className="font-display text-base font-bold text-cream">
                Chụp hoặc tải ảnh khẩu phần ăn
              </p>
              <p className="mt-1 text-sm text-muted">JPG, PNG hoặc WEBP — ảnh sẽ được tự động tối ưu dung lượng</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 cursor-pointer"
              >
                📷 Chụp ảnh
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-md border border-cream/25 px-4 py-2 text-sm font-semibold text-cream/90 transition-colors hover:border-cream/50 cursor-pointer"
              >
                Chọn từ thư viện
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-md bg-black/20">
              <Image src={previewUrl} alt="Xem trước khẩu phần ăn" fill className="object-cover" unoptimized />
            </div>
            <div className="flex flex-1 flex-col gap-3 self-stretch">
              <p className="text-sm text-muted">
                Sẵn sàng phân tích? AI sẽ nhận diện từng món ăn và ước tính lượng calo.
              </p>
              <div className="mt-auto flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  {analyzing ? "Đang phân tích…" : "Phân tích ảnh"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-cream/25 px-4 py-2 text-sm font-semibold text-cream/90 hover:border-cream/50 cursor-pointer"
                >
                  Chọn ảnh khác
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-chili/30 bg-chili/10 px-3 py-2 text-sm text-chili">
          {error}
        </p>
      )}

      {analyzing && (
        <div className="ticket">
          <div className="px-5 py-2 sm:px-7">
            <p className="font-mono text-sm text-muted-ink animate-pulse">
              🧾 Đang in phiếu calo của bạn…
            </p>
          </div>
        </div>
      )}

      {/* Step 2: editable results ticket */}
      {items && !analyzing && (
        <Ticket animate>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-mono text-[11px] font-medium tracking-[0.25em] text-muted-ink">
                PHIẾU CALO {isMock && <span className="text-herb">· CHẾ ĐỘ DEMO</span>}
              </p>
              <input
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                className="mt-1 w-full bg-transparent font-display text-lg font-extrabold text-ink outline-none focus:border-b focus:border-dashed focus:border-ink/40"
                placeholder="Tên bữa ăn"
              />
            </div>
            <input
              type="datetime-local"
              value={eatenAt}
              onChange={(e) => setEatenAt(e.target.value)}
              className="shrink-0 rounded-md border border-ink/15 bg-white/60 px-2 py-1 font-mono text-xs text-ink"
            />
          </div>

          {isMock && (
            <p className="mb-4 rounded-md border border-herb/30 bg-herb/10 px-3 py-2 text-xs text-herb">
              Đây là dữ liệu minh họa vì chưa cấu hình GEMINI_API_KEY. Kết quả thật sẽ chính xác hơn khi
              bạn thêm API key vào file .env.
            </p>
          )}

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    value={item.name}
                    onChange={(e) => {
                      // Editing the name means the food itself changed — opt back into
                      // auto-estimate even if this row already had a real AI/saved value.
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
                  {item.estimating ? (
                    <span className="text-herb animate-pulse">đang tính…</span>
                  ) : (
                    "kcal"
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Xóa ${item.name || "món ăn"}`}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-chili/70 hover:bg-chili/10 hover:text-chili cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 text-xs font-semibold text-herb hover:underline cursor-pointer"
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
              {Math.round(total).toLocaleString("vi-VN")} <span className="text-sm font-semibold">kcal</span>
            </span>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-muted-ink">Ghi chú (tuỳ chọn)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus:border-marigold focus:outline-none focus:ring-2 focus:ring-marigold/40"
              placeholder="Ví dụ: ăn ở quán gần công ty"
            />
          </div>

          {savedMessage && (
            <p className="mt-4 rounded-md border border-herb/30 bg-herb/10 px-3 py-2 text-sm text-herb">
              {savedMessage}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Đang lưu…" : "Lưu bữa ăn"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/80 hover:border-ink/40 cursor-pointer"
            >
              Chụp bữa khác
            </button>
          </div>
        </Ticket>
      )}

      {noFoodDetected && (
        <NoFoodDialog
          onRetake={() => {
            handleReset();
          }}
          onDismiss={() => setNoFoodDetected(false)}
        />
      )}
    </div>
  );
}
