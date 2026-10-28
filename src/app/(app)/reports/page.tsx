"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Equal } from "lucide-react"
import { apiGet } from "@/lib/api-client"
import type { ReportDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { CountUp } from "@/components/shared/count-up"
import { TrendChart, ComparisonBar, ChartLegend } from "@/components/charts/charts"
import { EntityIcon } from "@/components/shared/money-display"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatToman, formatChange, formatPercent } from "@/lib/money"
import {
  startOfJalaliMonth,
  endOfJalaliMonth,
  nowTehran,
  addJalaliMonths,
  startOfJalaliDay,
  endOfJalaliDay,
  jalaliOf,
  jalaliToInstant,
  formatJalali,
  monthKeyLabel,
  currentMonthKey,
} from "@/lib/jalali"
import { cn } from "@/lib/utils"

type RangeId = "this_month" | "last_month" | "3m" | "6m" | "this_year" | "custom"

export default function ReportsPage() {
  const [rangeId, setRangeId] = useState<RangeId>("this_month")
  const [customFrom, setCustomFrom] = useState<Date>(() => startOfJalaliMonth(nowTehran()))
  const [customTo, setCustomTo] = useState<Date>(() => endOfJalaliDay(nowTehran()))

  const now = nowTehran()
  const j = jalaliOf(now)

  const ranges: Record<Exclude<RangeId, "custom">, { from: Date; to: Date }> = {
    this_month: { from: startOfJalaliMonth(now), to: endOfJalaliDay(now) },
    last_month: {
      from: startOfJalaliMonth(addJalaliMonths(now, -1)),
      to: endOfJalaliMonth(addJalaliMonths(now, -1)),
    },
    "3m": { from: startOfJalaliMonth(addJalaliMonths(now, -2)), to: endOfJalaliDay(now) },
    "6m": { from: startOfJalaliMonth(addJalaliMonths(now, -5)), to: endOfJalaliDay(now) },
    this_year: { from: jalaliToInstant(j.jy, 1, 1, 0, 0, 0), to: endOfJalaliDay(now) },
  }

  const active = rangeId === "custom" ? { from: customFrom, to: customTo } : ranges[rangeId]

  const rangeLabels: { id: RangeId; label: string }[] = [
    { id: "this_month", label: "این ماه" },
    { id: "last_month", label: "ماه قبل" },
    { id: "3m", label: "۳ ماه" },
    { id: "6m", label: "۶ ماه" },
    { id: "this_year", label: "امسال" },
    { id: "custom", label: "سفارشی" },
  ]

  const { data, isLoading } = useQuery({
    queryKey: ["reports", active.from.toISOString(), active.to.toISOString()],
    queryFn: () =>
      apiGet<ReportDTO>(`/api/reports/summary?from=${active.from.toISOString()}&to=${active.to.toISOString()}`),
  })

  const incomeChange = data ? formatChange(data.totals.income, data.previous.income) : null
  const expenseChange = data ? formatChange(data.totals.expense, data.previous.expense) : null
  const profitChange = data ? formatChange(data.totals.profit, data.previous.profit) : null

  return (
    <div className="space-y-4">
      <PageHeader title="گزارش‌های مالی" subtitle="تحلیل بازه‌ای با مقایسه دوره قبل" />

      {/* انتخابگر بازه */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card">
        {rangeLabels.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRangeId(r.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
              rangeId === r.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
        {rangeId === "custom" ? (
          <div className="flex w-full flex-wrap items-center gap-2 pt-2 sm:w-auto">
            <JalaliDatePicker value={customFrom} onChange={setCustomFrom}>
              <Button variant="outline" size="sm" className="rounded-lg font-normal">
                از: <span className="nums">{formatJalaliShortFa(customFrom)}</span>
              </Button>
            </JalaliDatePicker>
            <JalaliDatePicker value={customTo} onChange={setCustomTo}>
              <Button variant="outline" size="sm" className="rounded-lg font-normal">
                تا: <span className="nums">{formatJalaliShortFa(customTo)}</span>
              </Button>
            </JalaliDatePicker>
          </div>
        ) : null}
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* خلاصه با مقایسه */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              title="درآمد"
              value={data.totals.income}
              change={incomeChange}
              good
              icon={<ArrowDownLeft className="size-4.5" />}
              tone="income"
            />
            <SummaryCard
              title="هزینه"
              value={data.totals.expense}
              change={expenseChange}
              good={false}
              icon={<ArrowUpRight className="size-4.5" />}
              tone="expense"
            />
            <SummaryCard
              title={data.totals.profit >= 0 ? "سود" : "کسری"}
              value={data.totals.profit}
              change={profitChange}
              good
              icon={data.totals.profit >= 0 ? <TrendingUp className="size-4.5" /> : <TrendingDown className="size-4.5" />}
              tone={data.totals.profit >= 0 ? "income" : "expense"}
            />
          </div>

          {/* نمودارها */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold">روند درآمد و هزینه</h3>
                <ChartLegend />
              </div>
              {data.series.length > 1 ? (
                <TrendChart data={data.series} height={260} />
              ) : (
                <p className="py-16 text-center text-xs text-muted-foreground">
                  برای نمایش روند، بازه بزرگ‌تری انتخاب کنید
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-bold">مقایسه ماهانه</h3>
              {data.series.length > 1 ? (
                <ComparisonBar data={data.series.slice(-6)} height={260} />
              ) : (
                <p className="py-16 text-center text-xs text-muted-foreground">
                  برای نمایش مقایسه، بازه بزرگ‌تری انتخاب کنید
                </p>
              )}
            </div>
          </div>

          {/* جدول دسته‌ها */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-bold">تفکیک هزینه‌ها بر اساس دسته</h3>
            {data.byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">در این بازه هزینه‌ای ثبت نشده است</p>
            ) : (
              <div className="space-y-3">
                {data.byCategory.map((c, i) => (
                  <motion.div
                    key={c.categoryId}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    className="flex items-center gap-3"
                  >
                    <EntityIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold">{c.name}</span>
                        <span className="nums shrink-0 text-muted-foreground">
                          {formatToman(c.amount, false)} — {formatPercent(c.percent)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${c.percent}%` }}
                          transition={{ duration: 0.6, delay: i * 0.04 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function SummaryCard({
  title,
  value,
  change,
  good,
  icon,
  tone,
}: {
  title: string
  value: number
  change: { text: string; direction: "up" | "down" | "flat" } | null
  good: boolean
  icon: React.ReactNode
  tone: "income" | "expense"
}) {
  const positive = value >= 0
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            tone === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
          )}
        >
          {icon}
        </span>
        {change && change.direction !== "flat" ? (
          <span
            className={cn(
              "nums flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
              (change.direction === "up") === good ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
            )}
          >
            {change.direction === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {change.text}
          </span>
        ) : (
          <span className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground">
            <Equal className="size-3" />
            بدون تغییر
          </span>
        )}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{title}</div>
      <div className={cn("nums mt-1 text-lg font-extrabold", tone === "income" ? "text-income" : "text-expense")} dir="rtl">
        <CountUp value={Math.abs(value)} format={(n) => `${positive ? "" : "−"}${formatToman(n, false)}`} />
      </div>
    </div>
  )
}

function formatJalaliShortFa(d: Date): string {
  return formatJalali(d)
}
