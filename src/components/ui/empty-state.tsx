"use client"

/**
 * حالت خالی یکدست (UI-06 + MO-05) — آیکون متحرک + دکمه اقدام مستقیم
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
  tone = "muted",
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  tone?: "muted" | "primary" | "success"
}) {
  const iconClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-income/10 text-income"
        : "bg-muted text-muted-foreground"
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-card"
    >
      {/* آیکون با انیمیشن ظریف شناور + پالس حلقه */}
      <div className="relative mx-auto w-fit">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-3xl"
          style={{ boxShadow: "0 0 0 0 rgba(14,124,102,0.18)" }}
          animate={{ boxShadow: ["0 0 0 0 rgba(14,124,102,0.16)", "0 0 0 14px rgba(14,124,102,0)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className={`flex size-16 items-center justify-center rounded-3xl ${iconClass}`}
        >
          <Icon className="size-8" strokeWidth={1.8} />
        </motion.div>
      </div>
      <p className="mt-4 text-sm font-bold">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5 h-11 rounded-2xl px-6 text-xs font-bold shadow-fab">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  )
}
