"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Wallet,
  HandCoins,
  ChevronLeft,
  PiggyBank,
  AlertTriangle,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import type { DashboardDTO } from "@/types"
import { CountUp } from "@/components/shared/count-up"
import { PageHeader } from "@/components/shared/page-header"
import { TrendChart, ExpenseDonut, ChartLegend } from "@/components/charts/charts"
import { TransactionRow } from "@/components/transactions/transaction-row"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatToman, formatChange, formatPercent, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { cn } from "@/lib/utils"

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardDTO>("/api/dashboard"),
  })
  const { user } = useTelegram()
  const { openQuickAdd } = useUIStore()

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const incomeChange = formatChange(data.month.income, data.month.prevIncome)
  const expenseChange = formatChange(data.month.expense, data.month.prevExpense)
  const profitChange = formatChange(data.month.profit, data.month.prevProfit)

  const stats = [
    {
      label: "درآمد ماه",
      value: data.month.income,
      icon: ArrowDownLeft,
      color: "var(--income)",
      bg: "color-mix(in srgb, var(--income) 10%, white)",
      change: incomeChange,
      changeGood: incomeChange.direction !== "down",
    },
    {
      label: "هزینه ماه",
      value: data.month.expense,
      icon: ArrowUpRight,
      color: "var(--expense)",
      bg: "color-mix(in srgb, var(--expense) 10%, white)",
      change: expenseChange,
      changeGood: expenseChange.direction === "down",
    },
    {
      label: "سود ماه",
      value: data.month.profit,
      icon: PiggyBank,
      color: "var(--primary)",
      bg: "color-mix(in srgb, var(--primary) 10%, white)",
      change: profitChange,
      changeGood: profitChange.direction !== "down",
    },
    {
      label: "تعداد تراکنش",
      value: data.month.count,
      icon: ArrowLeftRight,
      color: "var(--muted-foreground)",
      bg: "var(--muted)",
      isCount: true,
    },
  ]

  const riskyBudgets = data.budgetsAtRisk.filter((b) => b.percent >= b.alertThreshold)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
      <PageHeader
        title={`سلام${user?.name ? `، ${user.name}` : ""} 👋`}
        subtitle={<span className="nums">{formatJalaliWithWeekday(nowTehran())}</span>}
        actions={
          <Button onClick={() => openQuickAdd()} className="rounded-xl" size="default">
            ثبت سریع
          </Button>
        }
      />

      {/* کارت قهرمان: موجودی کل */}
      <motion.div variants={item} className="hero-gradient relative overflow-hidden rounded-[20px] p-6 text-white sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Wallet className="size-4" />
              موجودی کل حساب‌ها
            </div>
            <div className="nums mt-2 text-3xl font-extrabold sm:text-4xl" dir="rtl">
              <CountUp value={data.totalBalance} format={(n) => formatToman(n)} />
            </div>
            <div className="mt-2 text-xs text-white/70">
              در {toPersianDigits(data.accountsCount)} حساب فعال
            </div>
          </div>
          <div className="hidden rounded-2xl bg-white/12 px-4 py-3 text-xs sm:block">
            <div className="text-white/75">مانده بدهی من</div>
            <div className="nums mt-1 font-bold">{formatToman(data.debtsSummary.iOweRemaining)}</div>
            <div className="mt-2 text-white/75">مانده طلب من</div>
            <div className="nums mt-1 font-bold">{formatToman(data.debtsSummary.owedToMeRemaining)}</div>
          </div>
        </div>
      </motion.div>

      {/* کارت‌های آماری */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            className="rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
          >
            <div className="flex items-center justify-between">
              <span
                className="flex size-9 items-center justify-center rounded-xl"
                style={{ color: s.color, backgroundColor: s.bg }}
              >
                <s.icon className="size-4.5" />
              </span>
              {s.change ? (
                <span
                  className={cn(
                    "nums rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                    s.changeGood ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
                  )}
                >
                  {s.change.text}
                </span>
              ) : null}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">{s.label}</div>
            <div className="nums mt-1 text-lg font-extrabold sm:text-xl" dir="rtl">
              {s.isCount ? (
                <CountUp value={s.value} />
              ) : (
                <CountUp value={s.value} format={(n) => formatToman(n, false)} />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* نمودارها */}
      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div variants={item} className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">روند ۶ ماه اخیر</h3>
              <p className="text-xs text-muted-foreground">بر اساس ماه‌های شمسی</p>
            </div>
            <ChartLegend />
          </div>
          <TrendChart data={data.series} />
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-bold">تفکیک هزینه {data.month.label}</h3>
            <p className="text-xs text-muted-foreground">بر اساس دسته‌بندی</p>
          </div>
          {data.expenseByCategory.length > 0 ? (
            <>
              <ExpenseDonut data={data.expenseByCategory} total={data.month.expense} />
              <div className="mt-4 space-y-2">
                {data.expenseByCategory.slice(0, 4).map((c) => (
                  <div key={c.categoryId} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                    <span className="nums ms-auto shrink-0 font-semibold">{formatPercent(c.percent)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-52 flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <PiggyBank className="size-5" />
              </span>
              <p className="text-sm text-muted-foreground">هنوز هزینه‌ای در این ماه ثبت نشده</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* بودجه‌های در خطر + تراکنش‌های اخیر */}
      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div variants={item} className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold">وضعیت بودجه‌های ماه</h3>
            <Link href="/budgets" className="text-xs text-primary hover:underline">
              مدیریت
            </Link>
          </div>
          {riskyBudgets.length > 0 ? (
            <div className="space-y-3.5">
              {riskyBudgets.slice(0, 4).map((b) => (
                <div key={b.id}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold">{b.categoryName}</span>
                    <span
                      className={cn(
                        "nums font-bold",
                        b.percent >= 100 ? "text-expense" : "text-warning"
                      )}
                    >
                      {formatPercent(b.percent)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, b.percent)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn("h-full rounded-full", b.percent >= 100 ? "bg-expense" : "bg-warning")}
                    />
                  </div>
                  <div className="nums mt-1 text-[0.65rem] text-muted-foreground">
                    {formatToman(b.spent, false)} از {formatToman(b.amount, false)} تومان
                  </div>
                </div>
              ))}
            </div>
          ) : data.budgetsAtRisk.length > 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-income/10 text-income">
                <PiggyBank className="size-5" />
              </span>
              <p className="text-xs text-muted-foreground">همه بودجه‌ها در وضعیت سالم هستند 🌿</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <AlertTriangle className="size-5" />
              </span>
              <p className="text-xs text-muted-foreground">برای این ماه بودجه‌ای تعیین نشده</p>
              <Link
                href="/budgets"
                className="inline-flex h-7 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-muted"
              >
                تعیین بودجه
              </Link>
            </div>
          )}
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">آخرین تراکنش‌ها</h3>
            <Link href="/transactions" className="flex items-center gap-0.5 text-xs text-primary hover:underline">
              همه
              <ChevronLeft className="size-3.5" />
            </Link>
          </div>
          {data.lastTransactions.length > 0 ? (
            <div className="divide-y divide-border/60">
              {data.lastTransactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <HandCoins className="size-5" />
              </span>
              <p className="text-sm text-muted-foreground">هنوز تراکنشی ثبت نشده است</p>
              <Button onClick={() => openQuickAdd()} variant="outline" size="sm" className="rounded-lg">
                ثبت اولین تراکنش
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
