"use client"

/**
 * فیلتر قرصی با نشانگر لغزان — جایگزین ردیف دکمه‌های جدا در لیست‌ها
 *  • هر گزینه می‌تواند رنگ امضا (tone) و شمارنده (count) داشته باشد
 *  • نشانگر با فنر بین گزینه‌ها لیز می‌خورد (layoutId یکتا برای هر نمونه)
 *  • size="sm" برای ردیف دوم فیلترها
 */
import { useId, type ReactNode } from "react"
import { motion } from "framer-motion"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

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
  const layoutId = useId()
  return (
    <div
      role="tablist"
      className={cn(
        "relative flex rounded-[0.9rem] bg-[color-mix(in_srgb,var(--muted)_100%,var(--border)_35%)] p-1",
        size === "sm" ? "gap-0.5" : "gap-1",
        className
      )}
    >
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            style={{ ["--seg" as string]: o.tone ?? "var(--primary)" }}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.65rem] font-bold transition-colors duration-200",
              size === "sm" ? "h-8 px-2 text-caption" : "h-9 px-3 text-label",
              on ? "text-[color:var(--seg)]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                className="absolute inset-0 -z-10 rounded-[0.65rem] bg-card shadow-[0_1px_2px_rgb(16_24_40/0.08),0_2px_8px_-3px_rgb(16_24_40/0.12)]"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            {o.icon}
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span
                className={cn(
                  "nums grid h-4 min-w-4 place-items-center rounded-full px-1 text-micro leading-none",
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
