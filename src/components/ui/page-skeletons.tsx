"use client"

/**
 * اسکلتون‌های صفحه‌ای (UI-03) — ساختار محو-ظاهر به‌جای اسپینر چرخان.
 * هر صفحه اسکلتون هم‌شکل خودش را دارد تا حس سرعت و حرفه‌ای‌گری حفظ شود.
 */
import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری داشبورد">
      {/* قهرمان + میانبرها | کاشی‌ها — هم‌شکل داشبورد نسخهٔ ۷ */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="hero-solid space-y-2.5 rounded-3xl p-5 opacity-80 sm:p-6">
            <Skeleton className="h-3 w-20 bg-white/20" />
            <Skeleton className="h-9 w-52 bg-white/25" />
            <Skeleton className="h-3 w-36 bg-white/20" />
            <div className="grid grid-cols-3 gap-3 pt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 bg-white/15" />
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[4.6rem] rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-border/80 bg-card p-3.5 sm:p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-28" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      {/* نمودار + ستون کنار */}
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-56 w-full rounded-2xl sm:h-64" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-3 h-9 w-full rounded-xl" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="mt-2 h-9 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
              <Skeleton className="h-4 w-32" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="mt-2 h-12 w-full rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    // نسخهٔ ۷: هم‌شکل ردیف واقعی — یک کارت با ردیف‌های خط‌دار
    <div
      className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/80 bg-card"
      aria-busy="true"
      aria-label="در حال بارگذاری لیست"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <Skeleton className="size-[2.625rem] rounded-[32%]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3.5 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری جزئیات">
      <div className="flex justify-between">
        <Skeleton className="size-10 rounded-2xl" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-10 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-44 w-full rounded-3xl" />
      <Skeleton className="h-32 w-full rounded-3xl" />
    </div>
  )
}
