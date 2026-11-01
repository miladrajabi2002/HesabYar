"use client"

/**
 * داشبورد فروشگاه — وضعیت امروز/هفته/ماه، طلب و بستانکار، چک‌ها، نمودار
 * MO-01: شمارش انیمیشنی KPIها • MO-03: ورود تدریجی کارت‌ها
 * UI-03: اسکلتون • IMP-04: مدیریت خطا • ST-01: مقایسه دوره‌ای
 */
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpLeftSquare,
  CheckSquare2,
  ChevronLeft,
  FileText,
  Plus,
  Minus,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort, dayKeyToDate, JALALI_MONTHS, jalaliOf, nowTehran } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { DashboardSkeleton } from "@/components/ui/page-skeletons"
import { ErrorState } from "@/components/ui/error-state"
import { PersonAvatar } from "@/components/ui/person-avatar"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/lib/ui-store"

interface DashboardData {
  today: PeriodSum
  week: PeriodSum
  month: PeriodSum
  prevMonth: PeriodSum
  monthComparison: { sales: number | null; purchases: number | null; profit: number | null; saleCount: number | null }
  accounts: { id: string; name: string; bankKey: string; balance: number }[]
  totalBankBalance: number
  debtors: { id: string; name: string; phone: string | null; balance: number }[]
  creditors: { id: string; name: string; phone: string | null; balance: number }[]
  totalReceivable: number
  totalPayable: number
  checks: {
    upcoming: {
      id: string
      amount: number
      bankKey: string
      direction: string
      dueDate: string
      daysLeft: number
      serial: string
      person: { name: string }
    }[]
    pendingReceivedTotal: number
    pendingIssuedTotal: number
  }
  series: { day: string; sales: number; purchases: number; profit: number }[]
  recentInvoices: {
    id: string
    number: number
    type: string
    total: number
    date: string
    status: string
    person: { id: string; name: string }
  }[]
}

interface PeriodSum {
  sales: number
  purchases: number
  profit: number
  saleCount: number
  purchaseCount: number
}

/** MO-03: ترتیب ورود تدریجی */
const stagger = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  }),
}

/** ST-01: نشان تغییر درصد با فلش سبز/قرمز */
function DeltaBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return null
  const good = invert ? pct < 0 : pct > 0
  const neutral = pct === 0
  if (neutral) {
    return (
      <span className="flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-px text-[0.58rem] font-bold text-muted-foreground">
        <Minus className="size-2.5" />
        {toPersianDigits(Math.abs(pct))}٪
      </span>
    )
  }
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 rounded-md px-1.5 py-px text-[0.58rem] font-bold",
        good ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
      )}
      dir="ltr"
    >
      {good ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
      {toPersianDigits(Math.abs(pct))}٪
    </span>
  )
}

function SectionCard({
  title,
  icon,
  href,
  children,
  className,
}: {
  title: string
  icon?: React.ReactNode
  href?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5", className)}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 text-sm font-bold">{title}</h2>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-[0.7rem] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            همه
            <ChevronLeft className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
    refetchInterval: 60_000,
    retry: 1,
  })
  const openAddSheet = useUIStore((s) => s.openAddSheet)

  if (isLoading) return <DashboardSkeleton />

  if (isError || !data) {
    return (
      <ErrorState
        message="داشبورد بارگذاری نشد"
        detail="ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید."
        onRetry={() => refetch()}
      />
    )
  }

  const now = nowTehran()
  const j = jalaliOf(now)
  const monthLabel = `${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`

  // سری نمودار — راست به چپ
  const chartData = [...data.series].reverse().map((s) => ({
    ...s,
    label: formatJalaliShort(dayKeyToDate(s.day)),
  }))

  return (
    <div className="space-y-4">
      {/* ───────── کارت قهرمان — MO-03 ───────── */}
      <motion.div
        custom={0}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="hero-gradient relative overflow-hidden rounded-3xl p-5 text-white shadow-card sm:p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs opacity-80">فروش امروز</p>
            <p className="nums mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              <AnimatedNumber value={data.today.sales} format={(n) => formatToman(n, false)} />
              <span className="ms-1 text-sm font-medium opacity-75">تومان</span>
            </p>
            <p className="mt-2 text-xs opacity-80">
              {data.today.saleCount > 0
                ? `${toPersianDigits(data.today.saleCount)} فاکتور فروش • سود امروز: ${formatTomanCompact(data.today.profit)}`
                : "هنوز فروشی برای امروز ثبت نشده"}
            </p>
          </div>
          <button
            onClick={openAddSheet}
            className="flex items-center gap-1.5 rounded-2xl bg-white/15 px-3.5 py-2.5 text-xs font-bold backdrop-blur transition-all hover:bg-white/25 active:scale-95"
          >
            <Plus className="size-4" />
            فاکتور جدید
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-center">
          <div>
            <p className="text-[0.65rem] opacity-75">فروش این هفته</p>
            <p className="nums mt-0.5 text-sm font-bold">
              <AnimatedNumber value={data.week.sales} format={formatTomanCompact} />
            </p>
          </div>
          <div className="border-x border-white/15">
            <p className="text-[0.65rem] opacity-75">سود این هفته</p>
            <p className="nums mt-0.5 text-sm font-bold">
              <AnimatedNumber value={data.week.profit} format={formatTomanCompact} />
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] opacity-75">خرید این هفته</p>
            <p className="nums mt-0.5 text-sm font-bold">
              <AnimatedNumber value={data.week.purchases} format={formatTomanCompact} />
            </p>
          </div>
        </div>
      </motion.div>

      {/* ───────── KPIها با مقایسه دوره‌ای (ST-01) ───────── */}
      <motion.div
        custom={1}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Link
          href="/reports"
          className="group rounded-2xl border border-border/70 bg-card p-3.5 shadow-card transition-all hover:shadow-card-hover sm:p-4"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="size-3.5" />
              <span className="text-[0.7rem] font-medium">سود {monthLabel}</span>
            </div>
            <DeltaBadge pct={data.monthComparison.profit} />
          </div>
          <p className="nums mt-1.5 text-lg font-extrabold text-primary sm:text-xl">
            <AnimatedNumber value={data.month.profit} format={formatTomanCompact} />
          </p>
        </Link>
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card sm:p-4">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowUpRight className="size-3.5" />
              <span className="text-[0.7rem] font-medium">فروش {monthLabel}</span>
            </div>
            <DeltaBadge pct={data.monthComparison.sales} />
          </div>
          <p className="nums mt-1.5 text-lg font-extrabold text-income sm:text-xl">
            <AnimatedNumber value={data.month.sales} format={formatTomanCompact} />
          </p>
        </div>
        <Link
          href="/people?filter=debtors"
          className="group rounded-2xl border border-border/70 bg-card p-3.5 shadow-card transition-all hover:shadow-card-hover sm:p-4"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HandCoins className="size-3.5" />
            <span className="text-[0.7rem] font-medium">طلب از مشتریان</span>
          </div>
          <p className="nums mt-1.5 text-lg font-extrabold text-warning sm:text-xl">
            <AnimatedNumber value={data.totalReceivable} format={formatTomanCompact} />
          </p>
        </Link>
        <Link
          href="/people?filter=creditors"
          className="group rounded-2xl border border-border/70 bg-card p-3.5 shadow-card transition-all hover:shadow-card-hover sm:p-4"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="size-3.5" />
            <span className="text-[0.7rem] font-medium">بدهی به تأمین‌کننده</span>
          </div>
          <p className="nums mt-1.5 text-lg font-extrabold text-destructive sm:text-xl">
            <AnimatedNumber value={data.totalPayable} format={formatTomanCompact} />
          </p>
        </Link>
      </motion.div>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        {/* ───────── ستون اصلی ───────── */}
        <div className="space-y-4 lg:col-span-3">
          {/* نمودار */}
          <motion.div custom={2} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="فروش و سود ۳۰ روز اخیر"
              icon={<TrendingUp className="size-4 text-primary" />}
            >
              <div className="h-56 w-full sm:h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0e7c66" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0e7c66" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis
                      reversed
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={28}
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
                        name === "sales" ? "فروش" : "سود",
                      ]}
                      labelFormatter={(l) => `${l}`}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #eceef2",
                        fontSize: 12,
                        direction: "rtl",
                      }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#0e7c66" strokeWidth={2.2} fill="url(#gSales)" />
                    <Area type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2} fill="url(#gProfit)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 text-[0.7rem] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" /> فروش
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning" /> سود
                </span>
              </div>
            </SectionCard>
          </motion.div>

          {/* طلبکاران و بستانکاران — UI-07: آواتار رنگی */}
          <motion.div custom={3} variants={stagger} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-2">
            <SectionCard
              title="طلب از مشتریان"
              icon={<HandCoins className="size-4 text-warning" />}
              href="/people?filter=debtors"
            >
              <div className="mb-2.5 flex items-baseline justify-between rounded-xl bg-warning/10 px-3 py-2">
                <span className="text-[0.7rem] text-muted-foreground">جمع طلب‌ها</span>
                <span className="nums text-sm font-bold text-warning">
                  {formatToman(data.totalReceivable, false)}
                </span>
              </div>
              <div className="space-y-1">
                {data.debtors.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    href={`/people/${p.id}`}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <PersonAvatar name={p.name} size={30} className="rounded-xl" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                    <span className="nums text-xs font-bold text-warning">
                      {formatTomanCompact(p.balance)}
                    </span>
                  </Link>
                ))}
                {data.debtors.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    طلبی روی کسی نیست ✨
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="بدهی به تأمین‌کنندگان"
              icon={<ArrowUpLeftSquare className="size-4 text-destructive" />}
              href="/people?filter=creditors"
            >
              <div className="mb-2.5 flex items-baseline justify-between rounded-xl bg-destructive/10 px-3 py-2">
                <span className="text-[0.7rem] text-muted-foreground">جمع بدهی‌ها</span>
                <span className="nums text-sm font-bold text-destructive">
                  {formatToman(data.totalPayable, false)}
                </span>
              </div>
              <div className="space-y-1">
                {data.creditors.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    href={`/people/${p.id}`}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <PersonAvatar name={p.name} size={30} className="rounded-xl" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                    <span className="nums text-xs font-bold text-destructive">
                      {formatTomanCompact(Math.abs(p.balance))}
                    </span>
                  </Link>
                ))}
                {data.creditors.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    به کسی بدهکار نیستید ✨
                  </p>
                )}
              </div>
            </SectionCard>
          </motion.div>

          {/* آخرین فاکتورها — UI-07: آواتار */}
          <motion.div custom={4} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="آخرین فاکتورها"
              icon={<FileText className="size-4 text-primary" />}
              href="/invoices"
            >
              <div className="space-y-1.5">
                {data.recentInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <PersonAvatar name={inv.person.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold">{inv.person.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                            inv.type === "SALE"
                              ? "bg-income/10 text-income"
                              : "bg-destructive/10 text-destructive"
                          )}
                        >
                          {inv.type === "SALE" ? "فروش" : "خرید"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[0.65rem] text-muted-foreground">
                        فاکتور {toPersianDigits(inv.number)} • {formatJalaliShort(new Date(inv.date))}
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold">
                      {formatTomanCompact(inv.total)}
                    </span>
                  </Link>
                ))}
                {data.recentInvoices.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    هنوز فاکتوری ثبت نشده — از دکمه «فاکتور جدید» شروع کنید
                  </p>
                )}
              </div>
            </SectionCard>
          </motion.div>
        </div>

        {/* ───────── ستون کنار ───────── */}
        <div className="space-y-4 lg:col-span-2">
          <motion.div custom={3} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="چک‌های نزدیک سررسید"
              icon={<CheckSquare2 className="size-4 text-primary" />}
              href="/checks"
            >
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-primary/10 px-3 py-2">
                  <p className="text-[0.65rem] text-muted-foreground">چک دریافت‌شده در جریان</p>
                  <p className="nums mt-0.5 text-sm font-bold text-primary">
                    <AnimatedNumber value={data.checks.pendingReceivedTotal} format={formatTomanCompact} />
                  </p>
                </div>
                <div className="rounded-xl bg-destructive/10 px-3 py-2">
                  <p className="text-[0.65rem] text-muted-foreground">چک صادره در جریان</p>
                  <p className="nums mt-0.5 text-sm font-bold text-destructive">
                    <AnimatedNumber value={data.checks.pendingIssuedTotal} format={formatTomanCompact} />
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {data.checks.upcoming.slice(0, 5).map((c) => {
                  const overdue = c.daysLeft < 0
                  const soon = c.daysLeft <= 3
                  return (
                    <Link
                      key={c.id}
                      href="/checks"
                      className={cn(
                        "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors hover:bg-accent/50",
                        overdue
                          ? "border-destructive/30 bg-destructive/5"
                          : soon
                            ? "border-warning/30 bg-warning/5"
                            : "border-border/60"
                      )}
                    >
                      <BankLogo bankKey={c.bankKey} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold">{c.person.name}</div>
                        <div className="nums mt-0.5 text-[0.65rem] text-muted-foreground">
                          {formatJalaliShort(new Date(c.dueDate))}
                          <span className={cn("ms-1", overdue && "font-bold text-destructive")}>
                            {overdue
                              ? `${toPersianDigits(Math.abs(c.daysLeft))} روز گذشته`
                              : c.daysLeft === 0
                                ? "امروز"
                                : `${toPersianDigits(c.daysLeft)} روز مانده`}
                          </span>
                        </div>
                      </div>
                      <span className="nums shrink-0 text-xs font-extrabold">
                        {formatTomanCompact(c.amount)}
                      </span>
                    </Link>
                  )
                })}
                {data.checks.upcoming.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">چکی در جریان نیست</p>
                )}
              </div>
            </SectionCard>
          </motion.div>

          <motion.div custom={4} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="حساب‌های بانکی"
              icon={<Wallet className="size-4 text-primary" />}
              href="/accounts"
            >
              <div className="space-y-1.5">
                {data.accounts.map((a) => (
                  <Link
                    key={a.id}
                    href="/accounts"
                    className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <BankLogo bankKey={a.bankKey} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{a.name}</div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {getBank(a.bankKey).name}
                      </div>
                    </div>
                    <span className="nums shrink-0 text-xs font-extrabold">
                      {formatTomanCompact(a.balance)}
                    </span>
                  </Link>
                ))}
                <div className="mt-1 flex items-baseline justify-between rounded-xl bg-muted/70 px-3 py-2">
                  <span className="text-[0.7rem] font-medium text-muted-foreground">جمع موجودی</span>
                  <span className="nums text-sm font-extrabold text-primary">
                    <AnimatedNumber value={data.totalBankBalance} format={(n) => formatToman(n, false)} />
                  </span>
                </div>
                {data.accounts.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    هنوز حساب بانکی نساخته‌اید
                  </p>
                )}
              </div>
            </SectionCard>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
