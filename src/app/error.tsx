"use client"

/**
 * Error Boundary روت (app) — IMP-04
 * خطای رندر با پیام شیک + دکمه تلاش مجدد، بدون صفحه سفید مرگ.
 */
import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[hesabyar] خطای رندر صفحه:", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" />
        </div>
        <h2 className="mt-4 text-base font-extrabold">مشکلی در نمایش این صفحه پیش آمد</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          داده‌های شما کاملاً امن هستند. دوباره تلاش کنید یا اگر مشکل ادامه داشت از مرورگر دیگر وارد شوید.
        </p>
        <button
          onClick={reset}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white shadow-fab transition-transform active:scale-[0.98]"
        >
          <RotateCcw className="size-4" />
          تلاش مجدد
        </button>
      </div>
    </div>
  )
}
