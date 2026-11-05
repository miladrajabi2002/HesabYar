"use client"

/**
 * فیلتر قرصی با نشانگر لغزان — جایگزین ردیف دکمه‌های جدا در لیست‌ها
 *  • هر گزینه می‌تواند رنگ امضا (tone) و شمارنده (count) داشته باشد
 *  • نشانگر با transform CSS بین گزینه‌ها لیز می‌خورد (useSlidingPill)، نه layoutId framer:
 *    انیمیشن layout در هر فریم روی رشتهٔ اصلی اندازه می‌گرفت و درست همان لحظه که فهرست زیرش با
 *    فیلتر تازه رندر می‌شد فریم می‌انداخت. حالا یک بار اندازه گرفته می‌شود و حرکت روی compositor است.
 *  • size="sm" برای ردیف دوم فیلترها
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { motion } from "framer-motion"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * نشانگر لغزان مشترک تب‌ها. ظرف `relative` باشد و گزینهٔ فعال `data-pill-active` داشته باشد.
 * `layoutKey` هر چیزی است که اندازهٔ گزینه‌ها را عوض می‌کند (مثلاً شمارنده‌ها).
 * پیش از اندازه‌گیری اول (رندر سرور) گزینهٔ فعال پس‌زمینهٔ خودش را دارد — PILL_FALLBACK.
 */
export function useSlidingPill<C extends HTMLElement = HTMLDivElement>(activeKey: string | null | undefined, layoutKey = "") {
  const containerRef = useRef<C>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  useLayoutEffect(() => {
    const container = containerRef.current
    const pill = pillRef.current
    if (!container || !pill) return
    const place = (animate: boolean) => {
      const target = container.querySelector<HTMLElement>("[data-pill-active]")
      if (!target || !target.offsetWidth) {
        pill.style.opacity = "0"
        return
      }
      if (!animate) pill.style.transition = "none"
      pill.style.opacity = "1"
      pill.style.width = `${target.offsetWidth}px`
      pill.style.height = `${target.offsetHeight}px`
      pill.style.transform = `translate3d(${target.offsetLeft}px, ${target.offsetTop}px, 0)`
      if (!animate) {
        void pill.offsetWidth // جای تازه بدون انیمیشن ثبت شود، بعد transition برگردد
        pill.style.transition = ""
      }
      container.setAttribute("data-pill-ready", "")
    }
    place(placed.current)
    placed.current = true
    // تغییر اندازهٔ ظرف (چرخش گوشی، باز شدن سایدبار): بی‌انیمیشن جابه‌جا شود
    let width = container.clientWidth
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === width) return
      width = container.clientWidth
      place(false)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeKey, layoutKey])
  return { containerRef, pillRef }
}

/** کلاس‌های حرکت نشانگر: فقط transform روی compositor؛ عرض فقط وقتی گزینه‌ها هم‌اندازه نیستند عوض می‌شود */
export const PILL_MOTION =
  "pointer-events-none absolute left-0 top-0 opacity-0 transition-[transform,width,height,opacity] duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
/** گزینهٔ فعال تا وقتی نشانگر جا نیفتاده (رندر سرور، اولین فریم) خودش پس‌زمینه دارد */
export const PILL_FALLBACK = "[:not([data-pill-ready])>&]:bg-card [:not([data-pill-ready])>&]:shadow-[0_1px_2px_rgb(16_24_40/0.08)]"

export interface SegmentOption<T extends string> {
  key: T
  label: string
  icon?: ReactNode
  /** رنگ نشانگر وقتی انتخاب شده (CSS color) */
  tone?: string
  count?: number
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  size?: "sm" | "md"
  className?: string
}) {
  const { containerRef, pillRef } = useSlidingPill(value, options.map((o) => `${o.key}:${o.count ?? ""}`).join("|"))
  return (
    <div
      ref={containerRef}
      role="tablist"
      className={cn(
        "relative isolate flex rounded-md bg-[color-mix(in_srgb,var(--muted)_100%,var(--border)_35%)] p-1",
        size === "sm" ? "gap-0.5" : "gap-1",
        className
      )}
    >
      <span
        ref={pillRef}
        aria-hidden
        className={cn(PILL_MOTION, "-z-10 rounded-sm bg-card shadow-[0_1px_2px_rgb(16_24_40/0.08),0_2px_8px_-3px_rgb(16_24_40/0.12)]")}
      />
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-pill-active={on ? "" : undefined}
            onClick={() => onChange(o.key)}
            style={{ ["--seg" as string]: o.tone ?? "var(--primary)" }}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-bold transition-[color,transform] duration-200 active:scale-[0.97]",
              size === "sm" ? "h-8 px-2 text-caption" : "h-9 px-3 text-label",
              on ? cn("text-[color:var(--seg)]", PILL_FALLBACK) : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span
                className={cn(
                  "nums grid h-4 min-w-4 place-items-center rounded-full px-1 text-caption leading-none transition-colors duration-200",
                  on ? "bg-[color:var(--seg)] text-white" : "bg-foreground/8 text-muted-foreground"
                )}
              >
                {toPersianDigits(o.count > 99 ? "۹۹+" : o.count)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** چیپ فیلتر جانبی (مثل «فیلتر شخص») — حالت فعال با دکمهٔ حذف */
export function FilterChip({
  active,
  label,
  icon,
  onClick,
  onClear,
}: {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
  onClear?: () => void
}) {
  return (
    <motion.div layout className="flex shrink-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-9 items-center gap-1.5 border px-3 text-label font-bold transition-colors",
          active && onClear ? "rounded-s-xl border-e-0" : "rounded-xl",
          active ? "border-primary/40 bg-primary/8 text-primary" : "border-border bg-card text-foreground/75 hover:text-foreground"
        )}
      >
        {icon}
        <span className="max-w-28 truncate">{label}</span>
      </button>
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="حذف فیلتر"
          className="grid h-9 w-8 place-items-center rounded-e-xl border border-s-0 border-primary/40 bg-primary/8 text-primary hover:bg-primary/15"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}
