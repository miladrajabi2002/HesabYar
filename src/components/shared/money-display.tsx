"use client"

import { cn } from "@/lib/utils"
import { formatToman, formatTomanCompact } from "@/lib/money"
import { ICON_MAP } from "@/lib/icon-map"

/** نمایش مبلغ با رنگ معنایی (درآمد سبز، هزینه قرمز، انتقال خنثی) */
export function AmountText({
  amount,
  type,
  showSign = true,
  compact = false,
  className,
}: {
  amount: number
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "NEUTRAL"
  showSign?: boolean
  compact?: boolean
  className?: string
}) {
  const fmt = compact ? formatTomanCompact : formatToman
  if (type === "TRANSFER") {
    return <span className={cn("nums text-foreground", className)}>{fmt(amount)}</span>
  }
  const sign = showSign ? (type === "INCOME" ? "+" : "−") : ""
  return (
    <span className={cn("nums", type === "INCOME" ? "text-income" : "text-expense", className)}>
      {sign} {fmt(amount)}
    </span>
  )
}

/** آیکون دسته/حساب با پس‌زمینه رنگی ملایم */
export function EntityIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string
  color: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const Icon = ICON_MAP[icon] ?? ICON_MAP.CircleDollarSign
  const sizes = {
    sm: "size-8 rounded-[10px] [&_svg]:size-4",
    md: "size-10 rounded-xl [&_svg]:size-5",
    lg: "size-12 rounded-2xl [&_svg]:size-6",
  }
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", sizes[size], className)}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, color }}
    >
      <Icon />
    </span>
  )
}
