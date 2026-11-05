"use client"

/**
 * اسکلتون‌های صفحه‌ای (UI-03) — ساختار محو-ظاهر به‌جای اسپینر چرخان.
 * هر صفحه اسکلتون هم‌شکل خودش را دارد تا حس سرعت و حرفه‌ای‌گری حفظ شود.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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

function ListRowsSkeleton({ rows, offset = 0 }: { rows: number; offset?: number }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/80 bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <Skeleton className="size-[2.625rem] rounded-[32%]" />
          <div className="flex-1 space-y-2">
            {/* عرض‌های متفاوت تا شبیه فهرست واقعی باشد، نه ردیف‌های یکسان */}
            <Skeleton className="h-4" style={{ width: `${[58, 44, 66, 50, 38, 62][(i + offset) % 6]}%` }} />
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

/** فهرست ردیفی؛ `groups` برای صفحه‌هایی که ردیف‌ها را زیر سربرگ روز/حرف/گروه می‌چینند */
export function ListSkeleton({ rows = 6, groups = 1 }: { rows?: number; groups?: number }) {
  if (groups <= 1) {
    return (
      <div aria-busy="true" aria-label="در حال بارگذاری لیست">
        <ListRowsSkeleton rows={rows} />
      </div>
    )
  }
  const per = Math.max(1, Math.round(rows / groups))
  return (
    <div className="space-y-3" aria-busy="true" aria-label="در حال بارگذاری لیست">
      {Array.from({ length: groups }).map((_, g) => (
        <section key={g}>
          <Skeleton className="mx-2 mb-2 h-3.5 w-20" />
          <ListRowsSkeleton rows={g === groups - 1 ? Math.max(1, rows - per * (groups - 1)) : per} offset={g * per} />
        </section>
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

/** تنظیمات: موبایل بخش‌های ردیفی · دسکتاپ ستون بخش‌ها و کارت‌ها (هم‌شکل SettingsLayout) */
export function SettingsSkeleton() {
  const row = (i: number) => (
    <div key={i} className="flex min-h-[3.25rem] items-center gap-2.5 px-3.5 py-2.5">
      <Skeleton className="size-[1.875rem] rounded-[9px]" />
      <Skeleton className="h-3.5" style={{ width: `${[36, 48, 30, 42][i % 4]}%` }} />
      <span className="flex-1" />
      <Skeleton className="h-3 w-12" />
    </div>
  )
  return (
    <div aria-busy="true" aria-label="در حال بارگذاری تنظیمات">
      <div className="mx-auto max-w-2xl lg:hidden">
        {[3, 2, 4].map((n, si) => (
          <section key={si}>
            <Skeleton className={cn("mx-1 mb-2 h-3.5 w-24", si ? "mt-5" : "mt-0")} />
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {Array.from({ length: n }).map((_, i) => row(i + si))}
            </div>
          </section>
        ))}
      </div>
      <div className="mx-auto hidden max-w-6xl grid-cols-[15rem_minmax(0,1fr)] items-start gap-8 lg:grid">
        <div className="space-y-1 rounded-3xl border border-border bg-card p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              <Skeleton className="size-[1.875rem] rounded-[9px]" />
              <Skeleton className="h-3.5" style={{ width: `${[50, 62, 44, 56, 40, 60][i]}%` }} />
            </div>
          ))}
        </div>
        <div>
          <div className="mb-5 flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-3xl border border-border bg-card px-5 py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-[1.875rem] rounded-[9px]" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-11 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
