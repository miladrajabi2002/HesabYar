"use client"

/**
 * اسکلتون‌های صفحه‌ای (UI-03) — ساختار محو-ظاهر به‌جای اسپینر چرخان.
 * هر صفحه اسکلتون هم‌شکل خودش را دارد تا حس سرعت و حرفه‌ای‌گری حفظ شود.
 */
import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری داشبورد">
      {/* قهرمان */}
      <div className="hero-gradient flex h-40 items-center justify-between rounded-3xl p-5 opacity-80 sm:p-6">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-20 bg-white/20" />
          <Skeleton className="h-9 w-52 bg-white/25" />
          <Skeleton className="h-3 w-36 bg-white/20" />
        </div>
        <Skeleton className="h-10 w-28 rounded-2xl bg-white/20" />
      </div>
      {/* KPIها */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card sm:p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-28" />
          </div>
        ))}
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
    <div className="space-y-2.5" aria-busy="true" aria-label="در حال بارگذاری لیست">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <Skeleton className="size-11 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-20" />
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
