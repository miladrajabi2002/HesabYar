"use client"

/**
 * داشبورد فروشگاه — وضعیت امروز/هفته/ماه، طلب و بستانکار، چک‌ها، نمودار
 * UI-03: اسکلتون • IMP-04: مدیریت خطا • ST-01: مقایسه دوره‌ای
 * نسخهٔ ۳: اعداد ثابت خوانا (بدون شمارندهٔ انیمیشنی) + نوار KPI یکپارچه
 */
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  HandCoins,
  ReceiptText,
  ArrowUpLeftSquare,
  CheckSquare2,
  ChevronLeft,
  Plus,
  Minus,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, formatTomanParts, toPersianDigits } from "@/lib/money"
import { formatJalaliShort, JALALI_MONTHS, jalaliDayKey, jalaliOf, nowTehran } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { DashboardSkeleton } from "@/components/ui/page-skeletons"
import { ErrorState } from "@/components/ui/error-state"
import { RoleAvatar } from "@/components/ui/role-avatar"
import { cn } from "@/lib/utils"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { TrendChart, CollectionDonut, Sparkline, type Collection } from "@/components/charts/finance-charts"
import { useUIStore } from "@/lib/ui-store"

interface DashboardData {
  today: PeriodSum
  week: PeriodSum
  month: PeriodSum
  prevMonth: PeriodSum
  monthComparison: { sales: number | null; purchases: number | null; profit: number | null; saleCount: number | null }
  accounts: { id: string; name: string; bankKey: string; balance: number }[]
  totalBankBalance: number
  debtors: { id: string; name: string; phone: string | null; role: string | null; balance: number }[]
  creditors: { id: string; name: string; phone: string | null; role: string | null; balance: number }[]
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
  monthCollection: Collection
  recentInvoices: {
    id: string
    number: number
    type: string
    total: number
    date: string
    status: string
    person: { id: string; name: string; role: string | null }
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

/** مبلغ فشرده: عدد پررنگ + واحد کوچک کم‌رنگ (هیچ‌وقت دو خطی نمی‌شود) */
function Amt({ v, className, unitClassName }: { v: number; className?: string; unitClassName?: string }) {
  const { value, unit } = formatTomanParts(v)
  return (
    <span className={cn("nums inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      {value}
      {unit && <span className={cn("text-[0.62em] font-semibold opacity-60", unitClassName)}>{unit}</span>}
    </span>
  )
}

/** کاشی KPI — آیکون رنگی + برچسب + مبلغ */
function KpiTile({
  href,
  label,
  value,
  hue,
  icon,
  delta,
  invertDelta,
  spark,
}: {
  href: string
  label: string
  value: number
  hue: string
  icon: React.ReactNode
  delta?: number | null
  invertDelta?: boolean
  /** مینی‌ترند روزانه (از اول ماه تا امروز) */
  spark?: number[]
}) {
  return (
    <Link
      href={href}
      style={{ ["--tile" as string]: hue }}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-border/70 bg-card p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] sm:p-4"
    >
      <div className="relative flex items-center justify-between gap-1">
        <span className="icon-soft grid size-9 place-items-center rounded-2xl">{icon}</span>
        {delta !== undefined && <DeltaBadge pct={delta} invert={invertDelta} />}
      </div>
      <div className="relative min-w-0">
        <p className="truncate text-[0.7rem] font-medium text-muted-foreground">{label}</p>
        <Amt v={value} className="mt-0.5 text-lg font-black tracking-tight text-[color:var(--tile)] sm:text-xl" />
      </div>
      {spark && <Sparkline values={spark} color={hue} className="relative -mb-0.5 mt-auto" />}
    </Link>
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
  // مینی‌ترند کارت‌های ماه: روزهای ماه جاری تا امروز
  const monthPrefix = jalaliDayKey(now).slice(0, 7)
  const todayK = jalaliDayKey(now)
  const monthDays = data.series.filter((s) => s.day.startsWith(monthPrefix) && s.day <= todayK)
  const monthLabel = `${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`

  return (
    <div className="space-y-4">
      {/* ───────── کارت قهرمان ───────── */}
      <motion.div
        custom={0}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="hero-gradient relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-[0_20px_40px_-18px_rgba(7,74,61,0.6)] sm:p-6"
      >
        <div className="flex items-start justify-between">
          <div className="relative min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium opacity-85">
              <span className="relative size-1.5 rounded-full bg-emerald-300 hy-ping" />
              فروش امروز
            </p>
            {data.today.saleCount > 0 ? (
              <>
                <p className="nums mt-1.5 text-[2rem] font-black leading-none tracking-tight sm:text-[2.5rem]">
                  {formatToman(data.today.sales, false)}
                  <span className="ms-1.5 text-sm font-semibold opacity-70">تومان</span>
                </p>
                <p className="mt-2.5 text-xs opacity-85">
                  {toPersianDigits(data.today.saleCount)} فاکتور • سود {formatTomanCompact(data.today.profit)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-xl font-black leading-tight sm:text-2xl">هنوز فروشی ثبت نشده</p>
                <p className="mt-1.5 text-xs opacity-80">اولین فروش امروز را با دکمهٔ + ثبت کنید</p>
              </>
            )}
          </div>
          <button
            onClick={openAddSheet}
            className="relative flex shrink-0 items-center gap-1.5 rounded-2xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-[#0a6b56] shadow-lg shadow-black/10 transition-all hover:bg-white/90 active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.6} />
            فاکتور
          </button>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-black/10 p-1 text-center backdrop-blur-sm">
          {(
            [
              ["فروش هفته", data.week.sales],
              ["سود هفته", data.week.profit],
              ["خرید هفته", data.week.purchases],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="rounded-xl px-1 py-2">
              <p className="text-[0.62rem] opacity-75">{label}</p>
              <Amt v={v} className="mt-0.5 text-[0.82rem] font-extrabold" />
            </div>
          ))}
        </div>
      </motion.div>

      {/* ───────── کاشی‌های KPI ───────── */}
      <motion.div
        custom={1}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <KpiTile
          href="/reports"
          label={`سود ${monthLabel}`}
          value={data.month.profit}
          hue="var(--primary)"
          icon={<TrendingUp className="size-[1.1rem]" strokeWidth={2.2} />}
          delta={data.monthComparison.profit}
          spark={monthDays.map((d) => d.profit)}
        />
        <KpiTile
          href="/reports"
          label={`فروش ${monthLabel}`}
          value={data.month.sales}
          hue="var(--hue-invoices)"
          icon={<ReceiptText className="size-[1.1rem]" strokeWidth={2.2} />}
          delta={data.monthComparison.sales}
          spark={monthDays.map((d) => d.sales)}
        />
        <KpiTile
          href="/people?filter=debtors"
          label="طلب از مشتریان"
          value={data.totalReceivable}
          hue="var(--hue-checks)"
          icon={<HandCoins className="size-[1.1rem]" strokeWidth={2.2} />}
        />
        <KpiTile
          href="/people?filter=creditors"
          label="بدهی به فروشنده‌ها"
          value={data.totalPayable}
          hue="var(--expense)"
          icon={<Wallet className="size-[1.1rem]" strokeWidth={2.2} />}
        />
      </motion.div>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        {/* ───────── ستون اصلی ───────── */}
        <div className="space-y-4 lg:col-span-3">
          {/* نمودار */}
          <motion.div custom={2} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="روند فروش و سود"
              icon={<TrendingUp className="size-4 text-primary" />}
            >
              <TrendChart series={data.series} height={210} />
            </SectionCard>
          </motion.div>

          {/* وصول فروش این ماه */}
          <motion.div custom={2.5} variants={stagger} initial="hidden" animate="visible">
            <SectionCard title={`وصول فروش ${monthLabel}`} icon={<HandCoins className="size-4 text-primary" />}>
              <CollectionDonut data={data.monthCollection} />
            </SectionCard>
          </motion.div>

          {/* طلبکاران و بستانکاران — آواتار نقش‌محور */}
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
                    <RoleAvatar role={p.role} name={p.name} size={32} />
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
              title="بدهی به فروشنده‌ها"
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
                    <RoleAvatar role={p.role} name={p.name} size={32} />
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

          {/* آخرین فاکتورها — آیکون نوع فاکتور */}
          <motion.div custom={4} variants={stagger} initial="hidden" animate="visible">
            <SectionCard
              title="آخرین فاکتورها"
              icon={<ReceiptText className="size-4 text-primary" />}
              href="/invoices"
            >
              <div className="space-y-1.5">
                {data.recentInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <InvoiceTypeMark type={inv.type} size={38} />
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
                    {formatTomanCompact(data.checks.pendingReceivedTotal)}
                  </p>
                </div>
                <div className="rounded-xl bg-destructive/10 px-3 py-2">
                  <p className="text-[0.65rem] text-muted-foreground">چک صادره در جریان</p>
                  <p className="nums mt-0.5 text-sm font-bold text-destructive">
                    {formatTomanCompact(data.checks.pendingIssuedTotal)}
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
                    {formatToman(data.totalBankBalance, false)}
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
