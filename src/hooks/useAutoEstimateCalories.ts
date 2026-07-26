"use client";

import { useEffect, useRef } from "react";

export interface AutoEstimateItem {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  /** true while this row is waiting for the auto-estimate call to finish */
  estimating?: boolean;
  /**
   * true for rows whose calories should be auto-filled once the user (re)types a name +
   * quantity. Starts false for rows that already have a real value (AI photo analysis,
   * demo data, saved history) so we don't immediately overwrite it on load — but editing
   * the name or quantity flips it back to true, since that means the user is changing
   * what food the row represents and the calories need recalculating. Editing the calo
   * field by hand sets it back to false so that manual override sticks.
   */
  autoCalories?: boolean;
  /**
   * true when the last auto-estimate check determined `name` isn't a real, recognizable
   * food/drink (e.g. gibberish/mistyped text, or something that isn't edible at all) — shown
   * as an inline warning so the user can fix the name or enter calories manually instead.
   */
  foodNotFound?: boolean;
}

const AUTO_ESTIMATE_DEBOUNCE_MS = 700;

/**
 * Shared behavior for "type a food name + quantity and have the calories auto-fill"
 * used by both the photo-analysis result ticket (`PhotoUploadForm`) and the meal edit
 * ticket (`MealEditForm`). Debounces on name/quantity changes, calls
 * `POST /api/estimate-calories`, and guards against stale/out-of-order responses.
 *
 * Callers own the actual item list state; this hook only needs a way to read the latest
 * items and a way to patch one by id.
 */
export function useAutoEstimateCalories<T extends AutoEstimateItem>(
  items: T[],
  updateItem: (id: string, patch: Partial<T>) => void,
) {
  // Mirrors `items` so the debounced callback always reads the latest values (avoids
  // stale closures) without needing `items` in its own dependency list.
  const itemsRef = useRef<T[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const requestTokens = useRef<Record<string, number>>({});

  // Clear any pending debounced calls when the component unmounts.
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  function cancelAutoEstimate(id: string) {
    const timer = debounceTimers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete debounceTimers.current[id];
    }
    delete requestTokens.current[id];
  }

  function resetAutoEstimateState() {
    Object.values(debounceTimers.current).forEach(clearTimeout);
    debounceTimers.current = {};
    requestTokens.current = {};
  }

  async function runAutoEstimate(id: string) {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item || item.autoCalories === false) return;

    const name = item.name.trim();
    const quantity = item.quantity.trim();
    if (!name || !quantity) return;

    const token = (requestTokens.current[id] ?? 0) + 1;
    requestTokens.current[id] = token;

    updateItem(id, { estimating: true } as Partial<T>);
    try {
      const res = await fetch("/api/estimate-calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity }),
      });
      const data = await res.json();

      // If the user kept typing (or removed the row) after this request went out, a newer
      // call already owns this row — drop this stale response instead of overwriting it.
      if (requestTokens.current[id] !== token) return;

      if (!res.ok) {
        updateItem(id, { estimating: false } as Partial<T>);
        return;
      }
      if (data.found === false) {
        updateItem(id, { calories: 0, estimating: false, foodNotFound: true } as Partial<T>);
        return;
      }
      updateItem(id, {
        calories: Math.round(data.calories) || 0,
        estimating: false,
        foodNotFound: false,
      } as Partial<T>);
    } catch {
      if (requestTokens.current[id] !== token) return;
      updateItem(id, { estimating: false } as Partial<T>);
    }
  }

  function scheduleAutoEstimate(id: string) {
    cancelAutoEstimate(id);
    // Optimistically clear a stale "not found" warning as soon as the user starts editing
    // again, so it doesn't linger on-screen while they type a correction; it comes back if
    // the fresh check (after the debounce below) still can't recognize the new text.
    updateItem(id, { foodNotFound: false } as Partial<T>);
    debounceTimers.current[id] = setTimeout(() => {
      delete debounceTimers.current[id];
      void runAutoEstimate(id);
    }, AUTO_ESTIMATE_DEBOUNCE_MS);
  }

  return { scheduleAutoEstimate, cancelAutoEstimate, resetAutoEstimateState };
}
