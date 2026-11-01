"use client"

/**
 * حالت خطا (IMP-04) — به‌جای چرخش بی‌پایان اسپینر،
 * پیام خطای شیک + دکمه تلاش مجدد.
 */
import { motion } from "framer-motion"
import { CloudOff, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ErrorState({
  message = "بارگذاری اطلاعات ناموفق بود",
  detail,
  onRetry,
  compact = false,
}: {
  message?: string
  detail?: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        compact
          ? "rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center"
          : "rounded-3xl border border-dashed border-destructive/30 bg-card p-8 text-center shadow-card"
      }
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
      >
        <CloudOff className="size-7" />
      </motion.div>
      <p className="mt-3 text-sm font-bold">{message}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="mt-4 h-11 rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
        >
          <RotateCcw className="size-4" />
          تلاش مجدد
        </Button>
      )}
    </motion.div>
  )
}
