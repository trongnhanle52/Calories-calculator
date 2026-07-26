import type { ReactNode } from "react";

interface TicketProps {
  children: ReactNode;
  className?: string;
  tilt?: "left" | "right" | "none";
  animate?: boolean;
}

/**
 * The app's signature visual: a paper "calorie ticket" styled after a Vietnamese
 * quán ăn bill/receipt — perforated edges, dashed tear lines, monospace figures.
 */
export function Ticket({ children, className = "", tilt = "none", animate = false }: TicketProps) {
  const tiltClass = tilt === "left" ? "tilt-1" : tilt === "right" ? "tilt-2" : "";
  return (
    <div className={`ticket ${tiltClass} ${animate ? "ticket-enter" : ""} ${className}`}>
      <div className="px-5 sm:px-7">{children}</div>
    </div>
  );
}

export function TicketHeader({
  eyebrow = "PHIẾU CALO",
  title,
  dateLabel,
}: {
  eyebrow?: string;
  title: string;
  dateLabel?: string;
}) {
  return (
    <div className="mb-4">
      <p className="font-mono text-[11px] font-medium tracking-[0.25em] text-muted-ink">{eyebrow}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold leading-tight text-ink">{title}</h3>
        {dateLabel && <span className="shrink-0 font-mono text-xs text-muted-ink">{dateLabel}</span>}
      </div>
    </div>
  );
}

export function TicketRow({
  name,
  quantity,
  calories,
  delay = 0,
  animate = false,
}: {
  name: string;
  quantity?: string | null;
  calories: number;
  delay?: number;
  animate?: boolean;
}) {
  return (
    <div className={animate ? "row-enter" : ""} style={animate ? { animationDelay: `${delay}ms` } : undefined}>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-medium text-ink">{name}</span>
        <span className="mb-[3px] flex-1 border-b border-dotted border-muted-ink/50" />
        <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
          {Math.round(calories).toLocaleString("vi-VN")} kcal
        </span>
      </div>
      {quantity ? <p className="mt-0.5 text-xs text-muted-ink">{quantity}</p> : null}
    </div>
  );
}

export function TicketDivider() {
  return <div className="ticket-tear my-4" />;
}

export function TicketTotal({ total }: { total: number }) {
  return (
    <div className="border-t-2 border-double border-ink/70 pt-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold tracking-wide text-ink">TỔNG CỘNG</span>
        <span className="font-display text-2xl font-black tabular-nums text-marigold-ink">
          {Math.round(total).toLocaleString("vi-VN")}{" "}
          <span className="text-sm font-semibold">kcal</span>
        </span>
      </div>
    </div>
  );
}
