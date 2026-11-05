"use client"

/**
 * گزارش‌ها — سود روزانه/هفتگی/ماهانه شمسی + نمودار + پرفروش‌ها + بهترین مشتری‌ها
 * نسخهٔ ۷ (P7): چهار شاخص در یک کارت شبکه‌ای با جملهٔ مقایسه، سهم هر کالا با نوار افقی
 */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api-client"
import { formatTomanCompact, formatTomanParts, toPersianDigits } from "@/lib/money"
import { formatUnit } from "@/lib/units"
import {
  JALALI_MONTHS,
  jalaliOf,
  nowTehran,
  parseMonthKey,
} from "@/lib/jalali"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Select } from "@/components/ui/select"
import { PageHeader } from "@/components/layout/page-header"
import { TrendChart, CollectionDonut, type Collection } from "@/components/charts/finance-charts"

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
  const prevProfitMargin =
    data && data.prev.sales > 0 ? Math.round((data.prev.profit / data.prev.sales) * 100) : null
  const shownMonth = period === "custom" ? monthKey : thisMonth
  const { jm: shownJm } = parseMonthKey(shownMonth)
  const prevLabel =
    period === "day" ? "دیروز" : period === "week" ? "هفتهٔ قبل" : JALALI_MONTHS[(shownJm + 10) % 12]
  const isMonth = period === "month" || period === "custom"

  return (
    <div>
      <PageHeader title="گزارش‌ها" sub={`${label} | مقایسه با ${prevLabel}`} />

      {/* انتخاب دوره — انتخاب‌گر یکدست: امروز/این هفته + شش ماه اخیر؛ دسکتاپ dropdown، موبایل شیت */}
      <div className="mb-2">
        <Select
          size="sm"
          value={period === "day" || period === "week" ? period : monthKey}
          onChange={(v) => {
            if (v === "day" || v === "week") {
              setPeriod(v)
            } else {
              setMonthKey(v)
              setPeriod(v === thisMonth ? "month" : "custom")
            }
          }}
          title="دورهٔ گزارش"
          aria-label="دورهٔ گزارش"
          className="max-w-none sm:max-w-60"
          options={[
            { value: "day", label: "امروز" },
            { value: "week", label: "این هفته" },
            ...[thisMonth, ...prevMonthKeys(thisMonth, 5).reverse()].map((m) => {
              const { jy, jm } = parseMonthKey(m)
              return {
                value: m,
                label: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
                hint: m === thisMonth ? "این ماه" : undefined,
              }
            }),
          ]}
        />
      </div>

      {isLoading || !data ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-52 rounded-3xl" />
        </div>
      ) : (
        <div className="mt-3 grid items-start gap-4 lg:grid-cols-2">
          {/* چهار شاخص در یک کارت شبکه‌ای — مبلغ مشکی، جملهٔ مقایسه رنگی */}
          <section aria-label="شاخص‌ها" className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="grid grid-cols-2">
              <KpiCell
                label="فروش"
                value={<Money v={data.summary.sales} />}
                note={deltaText(data.summary.sales, data.prev.sales, prevLabel)}
                fallback={`${toPersianDigits(data.summary.saleCount)} فاکتور`}
              />
              <KpiCell
                label="سود خالص"
                value={<Money v={data.summary.profit} />}
                note={deltaText(data.summary.profit, data.prev.profit, prevLabel)}
                fallback="بعد از کسر تخفیف"
                className="border-s"
              />
              <KpiCell
                label="خرید"
                value={<Money v={data.summary.purchases} />}
                note={deltaText(data.summary.purchases, data.prev.purchases, prevLabel, true)}
                fallback={`${toPersianDigits(data.summary.purchaseCount)} فاکتور`}
                className="border-t"
              />
              <KpiCell
                label="حاشیهٔ سود"
                value={`${toPersianDigits(profitMargin)}٪`}
                note={
                  prevProfitMargin !== null && prevProfitMargin !== profitMargin
                    ? {
                        text: `${profitMargin > prevProfitMargin ? "↑" : "↓"} ${toPersianDigits(Math.abs(profitMargin - prevProfitMargin))} واحد نسبت به ${prevLabel}`,
                        tone: profitMargin > prevProfitMargin ? "good" : "bad",
                      }
                    : null
                }
                fallback="از هر ۱۰۰ تومان فروش"
                className="border-s border-t"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-caption">
              <span className="font-semibold text-muted-foreground">چک‌های سررسید دوره</span>
              <span className="nums">
                وصولی <b className="font-extrabold text-sale">{formatTomanCompact(data.summary.receivedChecks)}</b>
              </span>
              <span className="nums">
                پرداختی <b className="font-extrabold text-purchase">{formatTomanCompact(data.summary.issuedChecks)}</b>
              </span>
            </div>
          </section>

          {/* نمودار روند — محور مبلغ، روزها، نقطهٔ امروز */}
          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="mb-2 text-body font-extrabold">روند روزانه</h2>
            {data.series.length > 1 ? (
              <TrendChart series={data.series} height={230} mode="period" />
            ) : (
              <p className="py-8 text-center text-label text-muted-foreground">
                برای «{label}» نمودار روزانه معنا ندارد؛ «این هفته» یا ماه را ببینید
              </p>
            )}
          </section>

          {/* پرفروش‌ها — نوار افقی + سهم از فروش */}
          <ShareList
            title="پرفروش‌ترین کالاها"
            sub={`سهم از فروش ${label}`}
            total={data.summary.sales}
            empty="فروشی در این دوره نبوده"
            rows={data.topSold.map((p) => ({
              key: p.name,
              name: p.brand ? `${p.name} — ${p.brand}` : p.name,
              meta: `${toPersianDigits(p.qty)} ${formatUnit(p.unit)} | سود ${formatTomanCompact(p.profit)}`,
              value: p.revenue,
            }))}
          />

          {/* وصول فروش */}
          <section className="rounded-3xl border border-border bg-card p-4">
            <h2 className="text-body font-extrabold">وصول فروش</h2>
            <p className="mb-3 text-caption text-muted-foreground">
              از {formatTomanCompact(data.collection.total)} فروش {label}، چقدر پولش دست شما رسیده
            </p>
            <CollectionDonut data={data.collection} />
          </section>

          <ShareList
            title="بهترین مشتری‌ها"
            sub={`سهم از فروش ${label}`}
            total={data.summary.sales}
            empty="مشتری‌ای نبوده"
            tone="var(--role-customer)"
            rows={data.topCustomers.map((c, i) => ({
              key: c.name + i,
              name: c.name,
              meta: `${toPersianDigits(c.count)} فاکتور`,
              value: c.total,
            }))}
          />
        </div>
      )}
    </div>
  )
}

/** جملهٔ مقایسه با دورهٔ قبل — «↑ ۸٪ نسبت به مهر» */
function deltaText(
  value: number,
  prev: number,
  prevLabel: string,
  neutral = false
): { text: string; tone: "good" | "bad" | "muted" } | null {
  if (prev === 0) return null
  const pct = Math.round(((value - prev) / Math.abs(prev)) * 100)
  if (pct === 0) return { text: `بدون تغییر نسبت به ${prevLabel}`, tone: "muted" }
  return {
    text: `${pct > 0 ? "↑" : "↓"} ${toPersianDigits(Math.abs(pct))}٪ نسبت به ${prevLabel}`,
    tone: neutral ? "muted" : pct > 0 ? "good" : "bad",
  }
}

function KpiCell({
  label,
  value,
  note,
  fallback,
  className,
}: {
  label: string
  value: React.ReactNode
  note: { text: string; tone: "good" | "bad" | "muted" } | null
  fallback: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0 border-border px-4 py-3", className)}>
      <p className="text-label font-semibold text-muted-foreground">{label}</p>
      <p className="nums text-xl font-extrabold tracking-tight">{value}</p>
      <p
        className={cn(
          "nums truncate text-caption font-bold",
          !note && "font-medium text-muted-foreground",
          note?.tone === "good" && "text-income",
          note?.tone === "bad" && "text-destructive",
          note?.tone === "muted" && "text-muted-foreground"
        )}
      >
        {note ? note.text : fallback}
      </p>
    </div>
  )
}

/** مبلغ: عدد پررنگ + واحد کوچک و کم‌رنگ («۶۲٫۲ میلیون تومان») — هیچ‌وقت بریده نمی‌شود */
function Money({ v }: { v: number }) {
  const { value, unit } = formatTomanParts(v)
  return (
    <>
      {value}
      {unit && <span className="ms-1 text-caption font-semibold tracking-normal text-muted-foreground">{unit}</span>}
    </>
  )
}

/** فهرست رتبه‌بندی با نوار افقی و درصد سهم از کل فروش */
function ShareList({
  title,
  sub,
  rows,
  total,
  empty,
  tone = "var(--primary)",
}: {
  title: string
  sub: string
  rows: { key: string; name: string; meta: string; value: number }[]
  total: number
  empty: string
  tone?: string
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex items-baseline gap-2 px-4 pb-1 pt-3.5">
        <h2 className="text-body font-extrabold">{title}</h2>
        <span className="text-caption text-muted-foreground">{sub}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-label text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-3 px-4 pb-4 pt-2">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
            return (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-bold">{r.name}</span>
                  <span className="nums shrink-0 text-sm">
                    <b className="font-extrabold">{formatTomanCompact(r.value)}</b>
                    <span className="text-muted-foreground"> | {toPersianDigits(pct)}٪</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: tone }} />
                  </div>
                </div>
                <p className="nums mt-0.5 truncate text-caption text-muted-foreground">{r.meta}</p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
