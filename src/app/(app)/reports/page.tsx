"use client"

/**
 * گزارش‌ها — سود روزانه/هفتگی/ماهانه شمسی + نمودار + پرفروش‌ها + بهترین مشتری‌ها
 */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { BarChart3, Loader2, TrendingUp, Package, Users, HandCoins, ShoppingBag, CheckSquare2 } from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatUnit } from "@/lib/units"
import {
  JALALI_MONTHS,
  jalaliDayKey,
  jalaliOf,
  nowTehran,
  parseMonthKey,
} from "@/lib/jalali"
import { cn } from "@/lib/utils"
import { Segmented } from "@/components/ui/segmented"
import { TrendChart, CollectionDonut, Sparkline, type Collection } from "@/components/charts/finance-charts"

interface PeriodSum {
  sales: number
  purchases: number
  profit: number
  saleCount: number
  purchaseCount: number
  receivedChecks: number
  issuedChecks: number
}

interface ReportData {
  start: string
  end: string
  summary: PeriodSum
  prev: PeriodSum
  collection: Collection
  series: { day: string; sales: number; purchases: number; profit: number }[]
  topSold: { name: string; brand: string | null; unit: string; qty: number; revenue: number; profit: number }[]
  topCustomers: { name: string; total: number; count: number }[]
}

function monthKeyOf(date: Date): string {
  const j = jalaliOf(date)
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`
}

function prevMonthKeys(current: string, n: number): string[] {
  const keys: string[] = []
  const { jy, jm } = parseMonthKey(current)
  let y = jy
  let m = jm
  for (let i = 0; i < n; i++) {
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
    keys.unshift(`${y}-${String(m).padStart(2, "0")}`)
  }
  return keys
}

export default function ReportsPage() {
  const now = nowTehran()
  const thisMonth = monthKeyOf(now)
  const [period, setPeriod] = useState<"day" | "week" | "month" | "custom">("month")
  const [monthKey, setMonthKey] = useState(thisMonth)
  const months = [...prevMonthKeys(thisMonth, 5), thisMonth]

  const query =
    period === "custom"
      ? `period=month&month=${monthKey}`
      : `period=${period}`

  const { data, isLoading } = useQuery({
    queryKey: ["report", period, monthKey],
    queryFn: () => apiGet<ReportData>(`/api/reports/summary?${query}`),
  })

  const label =
    period === "day"
      ? "امروز"
      : period === "week"
        ? "این هفته"
        : (() => {
            const { jy, jm } = parseMonthKey(period === "custom" ? monthKey : thisMonth)
            return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
          })()

  const profitMargin =
    data && data.summary.sales > 0 ? Math.round((data.summary.profit / data.summary.sales) * 100) : 0
  // مینی‌ترند کارت‌ها: فقط روزهای سپری‌شده (روزهای آیندهٔ ماه خطِ صفر نسازند)
  const todayK = jalaliDayKey(nowTehran())
  const elapsedSeries = (data?.series ?? []).filter((d) => d.day <= todayK)
  const prevLabel = period === "day" ? "دیروز" : period === "week" ? "هفتهٔ قبل" : "ماه قبل"

  return (
    <div className="space-y-4">
      <h1 className="hidden text-lg font-extrabold lg:block lg:text-xl">گزارش‌ها</h1>

      {/* انتخاب دوره */}
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { key: "day", label: "امروز" },
          { key: "week", label: "این هفته" },
          { key: "month", label: "این ماه" },
          { key: "custom", label: "ماه دلخواه" },
        ]}
        className="sm:max-w-lg"
      />

      {/* انتخاب ماه شمسی */}
      {period === "custom" && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {months.map((m) => {
            const { jy, jm } = parseMonthKey(m)
            const active = monthKey === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMonthKey(m)}
                className={cn(
                  "shrink-0 rounded-2xl border px-4 py-2 text-xs font-bold transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {JALALI_MONTHS[jm - 1]} {toPersianDigits(jy)}
              </button>
            )
          })}
        </div>
      )}

      {isLoading || !data ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIها — با مقایسه نسبت به دورهٔ قبل */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ReportKpi
              i={0}
              label={`فروش ${label}`}
              value={data.summary.sales}
              prev={data.prev.sales}
              prevLabel={prevLabel}
              tone="var(--sale)"
              icon={<TrendingUp className="size-3.5" />}
              foot={`${toPersianDigits(data.summary.saleCount)} فاکتور`}
              spark={elapsedSeries.map((d) => d.sales)}
            />
            <ReportKpi
              i={1}
              label={`سود ${label}`}
              value={data.summary.profit}
              prev={data.prev.profit}
              prevLabel={prevLabel}
              tone="var(--warning)"
              icon={<BarChart3 className="size-3.5" />}
              foot={`حاشیه سود ${toPersianDigits(profitMargin)}٪`}
              spark={elapsedSeries.map((d) => d.profit)}
            />
            <ReportKpi
              i={2}
              label={`خرید ${label}`}
              value={data.summary.purchases}
              prev={data.prev.purchases}
              prevLabel={prevLabel}
              tone="var(--purchase)"
              icon={<ShoppingBag className="size-3.5" />}
              foot={`${toPersianDigits(data.summary.purchaseCount)} فاکتور`}
              spark={elapsedSeries.map((d) => d.purchases)}
              invert
            />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-3xl border border-border/70 bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-1.5 text-[0.68rem] font-bold text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-lg bg-[color:color-mix(in_srgb,var(--hue-checks)_13%,transparent)] text-[color:var(--hue-checks)]">
                  <CheckSquare2 className="size-3.5" />
                </span>
                چک‌های سررسید دوره
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[0.7rem]">
                  <span className="text-muted-foreground">وصولی</span>
                  <span className="nums font-extrabold text-[color:var(--sale)]">{formatTomanCompact(data.summary.receivedChecks)}</span>
                </div>
                <div className="flex items-center justify-between text-[0.7rem]">
                  <span className="text-muted-foreground">پرداختی</span>
                  <span className="nums font-extrabold text-[color:var(--purchase)]">{formatTomanCompact(data.summary.issuedChecks)}</span>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-5">
            {/* نمودار روند */}
            <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5 lg:col-span-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <BarChart3 className="size-4 text-primary" />
                روند روزانهٔ {label}
              </div>
              {data.series.length > 1 ? (
                <TrendChart series={data.series} height={240} mode="period" />
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  برای «{label}» نمودار روزانه معنا ندارد؛ «این هفته» یا «این ماه» را ببینید
                </p>
              )}
            </section>

            {/* وصول فروش */}
            <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5 lg:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                <HandCoins className="size-4 text-primary" />
                وصول فروش {label}
              </div>
              <p className="mb-3 text-[0.66rem] text-muted-foreground">
                از {formatTomanCompact(data.collection.total)} فروش، چقدر پولش دست ما رسیده
              </p>
              <CollectionDonut data={data.collection} />
            </section>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* پرفروش‌ها */}
            <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Package className="size-4 text-primary" />
                پرفروش‌ترین اجناس {label}
              </div>
              <div className="space-y-1.5">
                {data.topSold.map((p, i) => (
                  <div
                    key={p.name}
                    className="relative isolate flex items-center gap-2.5 overflow-hidden rounded-2xl border border-border/60 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "nums relative z-10 flex size-7 shrink-0 items-center justify-center rounded-lg text-[0.7rem] font-extrabold",
                        i === 0 ? "bg-[#f5a524] text-white" : i === 1 ? "bg-[#a8b3bd] text-white" : i === 2 ? "bg-[#c98a55] text-white" : "bg-muted"
                      )}
                    >
                      {toPersianDigits(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">
                        {p.name}
                        {p.brand ? <span className="font-medium text-muted-foreground"> — {p.brand}</span> : null}
                      </div>
                      <div className="nums text-[0.62rem] text-muted-foreground">
                        {toPersianDigits(p.qty)} {formatUnit(p.unit)} • سود {formatTomanCompact(p.profit)}
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold text-[color:var(--sale)]">
                      {formatTomanCompact(p.revenue)}
                    </span>
                    <RankBar value={p.revenue} max={data.topSold[0]?.revenue ?? 1} tone="var(--sale)" />
                  </div>
                ))}
                {data.topSold.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">فروشی در این دوره نبوده</p>
                )}
              </div>
            </section>

            {/* بهترین مشتری‌ها */}
            <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-primary" />
                بهترین مشتری‌ها {label}
              </div>
              <div className="space-y-1.5">
                {data.topCustomers.map((c, i) => (
                  <div
                    key={c.name + i}
                    className="relative isolate flex items-center gap-2.5 overflow-hidden rounded-2xl border border-border/60 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "nums relative z-10 flex size-7 shrink-0 items-center justify-center rounded-lg text-[0.7rem] font-extrabold",
                        i === 0 ? "bg-[#f5a524] text-white" : i === 1 ? "bg-[#a8b3bd] text-white" : i === 2 ? "bg-[#c98a55] text-white" : "bg-muted"
                      )}
                    >
                      {toPersianDigits(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{c.name}</div>
                      <div className="nums text-[0.62rem] text-muted-foreground">
                        {toPersianDigits(c.count)} فاکتور
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold text-[color:var(--role-customer)]">
                      {formatTomanCompact(c.total)}
                    </span>
                    <RankBar value={c.total} max={data.topCustomers[0]?.total ?? 1} tone="var(--role-customer)" />
                  </div>
                ))}
                {data.topCustomers.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">مشتری‌ای نبوده</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

/** نوار نسبی پشت ردیف رتبه‌بندی */
function RankBar({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 start-0 -z-10"
      style={{ background: `color-mix(in srgb, ${tone} 7%, transparent)` }}
      initial={{ width: 0 }}
      animate={{ width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%` }}
      transition={{ type: "spring", stiffness: 110, damping: 22, delay: 0.1 }}
    />
  )
}

/** کاشی شاخص گزارش + مقایسه با دورهٔ قبل */
function ReportKpi({
  i,
  label,
  value,
  prev,
  prevLabel,
  tone,
  icon,
  foot,
  spark,
  invert = false,
}: {
  i: number
  label: string
  value: number
  prev: number
  prevLabel: string
  tone: string
  icon: React.ReactNode
  foot: string
  /** مینی‌ترند روزانهٔ دوره */
  spark?: number[]
  /** برای خرید، افزایش «بد» نیست ولی رنگ خنثی‌تر می‌گیرد */
  invert?: boolean
}) {
  const pct = prev !== 0 ? Math.round(((value - prev) / Math.abs(prev)) * 100) : null
  const up = pct !== null && pct > 0
  const good = invert ? null : up
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, type: "spring", stiffness: 380, damping: 30 }}
      style={{ ["--tile" as string]: tone }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-card"
    >
      <div className="flex items-center gap-1.5 text-[0.68rem] font-bold text-muted-foreground">
        <span className="icon-soft grid size-6 place-items-center rounded-lg">{icon}</span>
        {label}
      </div>
      <p className="nums mt-2 text-lg font-extrabold sm:text-xl" style={{ color: "color-mix(in srgb, var(--tile) 85%, black)" }}>
        {formatTomanCompact(value)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6rem] text-muted-foreground">
        <span className="nums">{foot}</span>
        {pct !== null && pct !== 0 && (
          <span
            className={cn(
              "nums rounded-full px-1.5 py-px font-bold",
              good === null ? "bg-muted text-foreground" : good ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
            )}
            title={`نسبت به ${prevLabel}`}
          >
            {up ? "▲" : "▼"} {toPersianDigits(Math.abs(pct))}٪ <span className="font-normal opacity-70">از {prevLabel}</span>
          </span>
        )}
      </div>
      {spark && <Sparkline values={spark} color={tone} className="mt-2.5" />}
    </motion.div>
  )
}
