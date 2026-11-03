"use client"

/**
 * حالت خالی یکدست (UI-06 + MO-05، نسخهٔ ۷) — آیکون، توضیح علت و دکمهٔ اقدام مستقیم
 * به‌جای متن ساده «چیزی نیست».
 */
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = "muted",
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  /** نسخهٔ ۷: اقدام دوم (مثلاً «پاک کردن فیلترها») */
  secondaryLabel?: string
  onSecondary?: () => void
  tone?: "muted" | "primary" | "success"
}) {
  const iconClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-income/10 text-income"
        : "bg-muted text-muted-foreground"
  // نسخهٔ ۷: بدون قاب خط‌چین و سایه، بدون حرکت دائمی — فقط ورود نرم؛ متن بگوید چرا خالی است و راه حل بدهد
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="px-6 py-10 text-center"
    >
      <span className={`mx-auto flex size-14 items-center justify-center rounded-full ${iconClass}`}>
        <Icon className="size-6" strokeWidth={1.9} />
      </span>
      <p className="mt-4 text-base font-extrabold">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-[32ch] text-label leading-6 text-muted-foreground">{description}</p>
      )}
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button onClick={onAction} className="h-11 rounded-2xl px-5 text-label font-bold">
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button onClick={onSecondary} variant="ghost" className="h-11 rounded-2xl px-4 text-label font-bold text-muted-foreground">
              {secondaryLabel}
            </Button>
          )}
        </div>
      ) : null}
    </motion.div>
  )
}
