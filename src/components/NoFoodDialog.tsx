"use client";

import { useEffect, useRef } from "react";
import { Ticket } from "@/components/Ticket";

interface NoFoodDialogProps {
  onRetake: () => void;
  onDismiss: () => void;
}

/**
 * Popup shown when Gemini looked at the photo and confirmed there's no food or drink in it.
 * Styled as a stamped ticket to stay in the app's "phiếu tính calo" visual language.
 */
export function NoFoodDialog({ onRetake, onDismiss }: NoFoodDialogProps) {
  const retakeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retakeButtonRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-food-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <Ticket animate className="text-center">
          <span className="inline-block -rotate-6 rounded-sm border-2 border-chili px-3 py-1 font-display text-xs font-black uppercase tracking-widest text-chili">
            Không thấy món ăn
          </span>

          <h2 id="no-food-dialog-title" className="mt-4 font-display text-lg font-extrabold text-ink">
            Ảnh này chưa có món ăn nào
          </h2>
          <p className="mt-2 text-sm text-muted-ink">
            AI không nhận ra món ăn hay thức uống nào rõ ràng trong ảnh. Hãy thử chụp lại gần hơn,
            đủ sáng, hoặc chọn một ảnh khác.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              ref={retakeButtonRef}
              type="button"
              onClick={onRetake}
              className="rounded-md bg-marigold px-4 py-2 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 cursor-pointer"
            >
              Chụp ảnh khác
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/80 hover:border-ink/40 cursor-pointer"
            >
              Tự nhập món ăn
            </button>
          </div>
        </Ticket>
      </div>
    </div>
  );
}
