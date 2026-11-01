"use client"

/**
 * واگردانی حذف (IMP-09) — حذف سریع بدون پنجره تأیید،
 * با ۵ ثانیه فرصت «بازگردانی» داخل توست.
 */
import { toast } from "sonner"
import { Undo2 } from "lucide-react"

export function showUndoToast(options: {
  message: string
  onUndo: () => void | Promise<void>
  duration?: number
}) {
  toast(options.message, {
    duration: options.duration ?? 5000,
    action: {
      label: (
        <span className="flex items-center gap-1 font-bold">
          <Undo2 className="size-3.5" />
          بازگردانی
        </span>
      ) as unknown as string,
      onClick: () => {
        void options.onUndo()
      },
    },
  })
}
