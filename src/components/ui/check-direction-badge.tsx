"use client"

/**
 * نشان جهت چک — فقط آیکون (نسخهٔ ۷): فلش پایین سبز = دریافتی، فلش بالا نیلی = صادره
 * در لیست چک‌ها، تقویم مالی و جزئیات فاکتور استفاده می‌شود.
 */
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine } from "lucide-react"
import { cn } from "@/lib/utils"

export function CheckDirectionBadge({
  direction,
  size = "md",
  iconOnly = false,
  className,
}: {
  direction: string
  size?: "sm" | "md"
  /** فقط آیکون — وقتی کنارش برچسب متنی («دریافتی در جریان») هست، تکرار متن لازم نیست */
  iconOnly?: boolean
  className?: string
}) {
  const received = direction === "RECEIVED"
  if (iconOnly) {
    const Icon = received ? ArrowDownToLine : ArrowUpFromLine
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-xl",
          received
            ? "bg-[color:color-mix(in_srgb,var(--sale)_13%,transparent)] text-[color:var(--sale)]"
            : "bg-[color:color-mix(in_srgb,var(--purchase)_13%,transparent)] text-[color:var(--purchase)]",
          className
        )}
      >
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
    )
  }
  // نسخهٔ ۷: فقط آیکون — فلش پایین سبز (دریافتی) / فلش بالا نیلی (صادره)؛ متن فقط برای صفحه‌خوان
  const Icon = received ? ArrowDown : ArrowUp
  return (
    <span
      role="img"
      aria-label={received ? "چک دریافتی" : "چک صادره"}
      title={received ? "دریافتی" : "صادره"}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        size === "sm" ? "size-5" : "size-6",
        received
          ? "bg-[color:color-mix(in_srgb,var(--sale)_12%,transparent)] text-[color:var(--sale)]"
          : "bg-[color:color-mix(in_srgb,var(--purchase)_12%,transparent)] text-[color:var(--purchase)]",
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.8} />
    </span>
  )
}
