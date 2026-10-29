"use client"

/**
 * گزارش‌ها — سود روزانه/هفتگی/ماهانه شمسی + نمودار + پرفروش‌ها + بهترین مشتری‌ها
 */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"
import { BarChart3, Loader2, TrendingUp, Package, Users, Percent } from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import {
  formatJalaliShort,
  JALALI_MONTHS,
  jalaliOf,
  nowTehran,
  parseMonthKey,
} from "@/lib/jalali"
import { cn } from "@/lib/utils"

interface ReportData {
  start: string
  end: string
  summary: {
    sales: number
    purchases: number
    profit: number
    saleCount: number
    purchaseCount: number
    receivedChecks: number
    issuedChecks: number
  }
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

  const chartData = data
    ? [...data.series].reverse().map((s) => ({ ...s, label: formatJalaliShort(new Date(s.day)) }))
    : []

  const profitMargin =
    data && data.summary.sales > 0 ? Math.round((data.summary.profit / data.summary.sales) * 100) : 0

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold sm:text-xl">گزارش‌ها</h1>

      {/* انتخاب دوره */}
      <div className="flex gap-2">
        {(
          [
            { key: "day", label: "امروز" },
            { key: "week", label: "این هفته" },
            { key: "month", label: "این ماه" },
            { key: "custom", label: "ماه دلخواه" },
          ] as const
        ).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={cn(
              "flex-1 rounded-2xl border py-2.5 text-xs font-bold transition-all",
              period === p.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

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
          {/* KPIها */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-income/25 bg-income/10 p-4">
              <div className="flex items-center gap-1.5 text-[0.7rem] text-income">
                <TrendingUp className="size-3.5" />
                فروش {label}
              </div>
              <p className="nums mt-1.5 text-lg font-extrabold text-income sm:text-xl">
                {formatTomanCompact(data.summary.sales)}
              </p>
              <p className="nums mt-0.5 text-[0.62rem] text-muted-foreground">
                {toPersianDigits(data.summary.saleCount)} فاکتور
              </p>
            </div>
            <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-4">
              <div className="flex items-center gap-1.5 text-[0.7rem] text-destructive">
                <Package className="size-3.5" />
                خرید {label}
              </div>
              <p className="nums mt-1.5 text-lg font-extrabold text-destructive sm:text-xl">
                {formatTomanCompact(data.summary.purchases)}
              </p>
              <p className="nums mt-0.5 text-[0.62rem] text-muted-foreground">
                {toPersianDigits(data.summary.purchaseCount)} فاکتور
              </p>
            </div>
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
              <div className="flex items-center gap-1.5 text-[0.7rem] text-primary">
                <BarChart3 className="size-3.5" />
                سود {label}
              </div>
              <p className="nums mt-1.5 text-lg font-extrabold text-primary sm:text-xl">
                {formatTomanCompact(data.summary.profit)}
              </p>
              <p className="nums mt-0.5 flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                <Percent className="size-3" />
                حاشیه سود {toPersianDigits(profitMargin)}٪
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
              <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                چک‌های سررسید در دوره
              </div>
              <p className="nums mt-1.5 text-sm font-extrabold text-primary">
                دریافت: {formatTomanCompact(data.summary.receivedChecks)}
              </p>
              <p className="nums mt-0.5 text-sm font-extrabold text-destructive">
                صادره: {formatTomanCompact(data.summary.issuedChecks)}
              </p>
            </div>
          </div>

          {/* نمودار */}
          <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="size-4 text-primary" />
              فروش، خرید و سود روزانه
            </div>
            {chartData.length > 1 ? (
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis
                      reversed
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#9aa4b2" }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tickFormatter={(v: number) =>
                        v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}م` : v >= 1000 ? `${Math.round(v / 1000)}ه` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatToman(value),
                        name === "sales" ? "فروش" : name === "purchases" ? "خرید" : "سود",
                      ]}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #eceef2",
                        fontSize: 12,
                        direction: "rtl",
                      }}
                    />
                    <Legend
                      formatter={(v) => (v === "sales" ? "فروش" : v === "purchases" ? "خرید" : "سود")}
                      wrapperStyle={{ fontSize: 12, direction: "rtl" }}
                    />
                    <Bar dataKey="sales" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="purchases" fill="#e5484d" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line type="monotone" dataKey="profit" stroke="#0e7c66" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                برای «{label}» نموداری نیست؛ بازه بزرگ‌تری انتخاب کنید
              </p>
            )}
          </section>

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
                    className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5"
                  >
                    <span className="nums flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[0.7rem] font-extrabold">
                      {toPersianDigits(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{p.name}</div>
                      <div className="nums text-[0.62rem] text-muted-foreground">
                        {toPersianDigits(p.qty)} {p.unit} • سود {formatTomanCompact(p.profit)}
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold text-income">
                      {formatTomanCompact(p.revenue)}
                    </span>
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
                    className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5"
                  >
                    <span className="nums flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[0.7rem] font-extrabold">
                      {toPersianDigits(i + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{c.name}</div>
                      <div className="nums text-[0.62rem] text-muted-foreground">
                        {toPersianDigits(c.count)} فاکتور
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold text-income">
                      {formatTomanCompact(c.total)}
                    </span>
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
