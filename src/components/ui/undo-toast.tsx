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
import { useUIStore } from "@/lib/ui-store"

function Countdown({ ms }: { ms: number }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000))
  useEffect(() => {
    // از روی زمان پایان حساب می‌شود تا با کند شدن تایمر (تب پس‌زمینه) از حلقه عقب نیفتد
    const end = Date.now() + ms
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250)
    return () => clearInterval(t)
  }, [ms])
  return (
    <span className="hy-countdown relative block size-8" style={{ ["--hy-cd" as string]: `${ms}ms` }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-8 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={3} />
        <circle className="hy-cd-ring" cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth={3} pathLength={100} strokeLinecap="round" />
      </svg>
      {/* عدد مطلقاً وسط حلقه — قانون عمومی آیکون اعلان روی فرزند مستقیم display:block می‌گذارد و grid را خنثی می‌کرد */}
      <span className="nums absolute inset-0 grid place-items-center text-caption font-extrabold leading-none">{toPersianDigits(left)}</span>
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

/** «کار حذف شد» → «کار سر جایش برگشت»؛ اگر موضوعی در پیام نبود: «حذف لغو شد» */
function restoredMessage(message: string): string {
  const subject = message.replace(/\s*(حذف|بایگانی|بسته) شد$/, "").trim()
  return subject && subject !== message ? `${subject} سر جایش برگشت` : "حذف لغو شد"
}

// حذف‌های در انتظار — اگر صفحه بسته شود، همان لحظه نهایی می‌شوند
const pendingCommits = new Map<string, () => void>()
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => pendingCommits.forEach((commit) => commit()))
}

/**
 * حذف با فرصت بازگردانی (X1): ردیف فوراً پنهان می‌شود و اعلان شمارش معکوس می‌آید؛
 * حذف واقعی (commit) فقط وقتی اجرا می‌شود که فرصت تمام شود یا اعلان کنار زده شود.
 */
export function deferDelete(options: {
  id: string
  message: string
  description?: string
  commit: () => Promise<unknown>
  /** بعد از حذف واقعی (مثلاً invalidate کوئری‌ها) */
  onCommitted?: () => void | Promise<void>
  duration?: number
}) {
  const { setPendingDelete } = useUIStore.getState()
  const duration = options.duration ?? 7000
  let settled = false
  setPendingDelete(options.id, true)

  const commit = () => {
    if (settled) return
    settled = true
    pendingCommits.delete(options.id)
    options
      .commit()
      .then(async () => {
        await options.onCommitted?.()
        setPendingDelete(options.id, false)
      })
      .catch((e: unknown) => {
        setPendingDelete(options.id, false)
        toast.error(e instanceof Error ? e.message : "حذف ناموفق بود")
      })
  }
  pendingCommits.set(options.id, commit)

  toast(options.message, {
    duration,
    description: options.description,
    icon: <Countdown ms={duration} />,
    onAutoClose: commit,
    onDismiss: commit,
    action: {
      label: (
        <span className="flex items-center gap-1 font-bold">
          <Undo2 className="size-3.5" />
          بازگردانی
        </span>
      ) as unknown as string,
      onClick: () => {
        if (settled) return
        settled = true
        pendingCommits.delete(options.id)
        setPendingDelete(options.id, false)
        toast.success(restoredMessage(options.message))
      },
    },
  })
}
