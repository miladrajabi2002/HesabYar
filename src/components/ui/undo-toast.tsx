"use client"

/**
 * واگردانی (IMP-09، نسخهٔ ۷ X1) — اقدام سریع بدون پنجرهٔ تأیید،
 * با چند ثانیه فرصت «بازگردانی» داخل اعلان پایین صفحه (نزدیک انگشت).
 * شمارش معکوس روی حلقه دیده می‌شود و توضیح پیامد زیر عنوان می‌آید.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Undo2 } from "lucide-react"
import { toPersianDigits } from "@/lib/money"

function Countdown({ ms }: { ms: number }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000))
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="hy-countdown relative grid size-8 place-items-center" style={{ ["--hy-cd" as string]: `${ms}ms` }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-8 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={3} />
        <circle className="hy-cd-ring" cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth={3} pathLength={100} strokeLinecap="round" />
      </svg>
      <span className="nums relative text-caption font-extrabold">{toPersianDigits(left)}</span>
    </span>
  )
}

export function showUndoToast(options: {
  message: string
  /** پیامد کوتاه، مثلاً «۹ قلم به انبار برگشت» */
  description?: string
  onUndo: () => void | Promise<void>
  duration?: number
}) {
  const duration = options.duration ?? 7000
  toast(options.message, {
    duration,
    description: options.description,
    icon: <Countdown ms={duration} />,
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
