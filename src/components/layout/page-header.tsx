"use client"

/**
 * سربرگ صفحه (طرح S1، نسخهٔ ۷)
 *  • دسکتاپ: عنوان ۲۳px + خلاصهٔ کاربردی + دکمه‌های اصلی کنار هم
 *  • موبایل: عنوان در هدر پوسته است؛ این کامپوننت فقط زیرعنوان را به هدر می‌دهد
 *    و دکمه‌ها (اگر mobileActions) زیر هدر می‌نشینند
 */
import { ReactNode, useEffect } from "react"
import { useUIStore } from "@/lib/ui-store"
import { cn } from "@/lib/utils"

/** فقط زیرعنوان هدر موبایل را تنظیم می‌کند (صفحه‌هایی که سربرگ دسکتاپ خودشان را دارند) */
export function usePageSub(sub: string | null | undefined) {
  const setPageSub = useUIStore((s) => s.setPageSub)
  useEffect(() => {
    setPageSub(sub ?? null)
    return () => setPageSub(null)
  }, [sub, setPageSub])
}

export function PageHeader({
  title,
  sub,
  actions,
  mobileActions = false,
  className,
}: {
  title: string
  sub?: string | null
  actions?: ReactNode
  /** دکمه‌ها در موبایل هم دیده شوند (زیر هدر) */
  mobileActions?: boolean
  className?: string
}) {
  usePageSub(sub)

  return (
    <div className={cn("mb-4 flex items-end gap-3 lg:mb-5", !mobileActions && "hidden lg:flex", className)}>
      <div className="hidden min-w-0 flex-1 lg:block">
        <h1 className="truncate text-page font-extrabold tracking-tight">{title}</h1>
        {sub ? <p className="nums truncate text-label text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">{actions}</div> : null}
    </div>
  )
}
