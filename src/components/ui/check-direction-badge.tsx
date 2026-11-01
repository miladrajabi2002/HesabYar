"use client"

/**
 * نشان عمودی جهت چک — آیکون بالا، متن پایین (دریافتی / صادره)
 * در لیست چک‌ها، تقویم مالی و جزئیات فاکتور استفاده می‌شود.
 */
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { cn } from "@/lib/utils"

export function CheckDirectionBadge({
  direction,
  size = "md",
  className,
}: {
  direction: string
  size?: "sm" | "md"
  className?: string
}) {
  const received = direction === "RECEIVED"
  const iconSize = size === "sm" ? "size-3" : "size-3.5"
  const textSize = size === "sm" ? "text-[0.52rem]" : "text-[0.58rem]"
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-px rounded-xl px-1.5 py-1 font-bold leading-none",
        received ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
        className
      )}
    >
      {received ? (
        <ArrowDownToLine className={cn(iconSize, "mb-px")} strokeWidth={2.4} />
      ) : (
        <ArrowUpFromLine className={cn(iconSize, "mb-px")} strokeWidth={2.4} />
      )}
      <span className={textSize}>{received ? "دریافتی" : "صادره"}</span>
    </span>
  )
}
