"use client"

/**
 * داشبورد فروشگاه — وضعیت امروز/هفته/ماه، طلب و بستانکار، چک‌ها، نمودار
 * UI-03: اسکلتون • IMP-04: مدیریت خطا • ST-01: مقایسه دوره‌ای
 * نسخهٔ ۳: اعداد ثابت خوانا (بدون شمارندهٔ انیمیشنی)
 * نسخهٔ ۷: بدون ورود پلکانی کارت‌ها (حرکت کمتر)؛ قهرمان یکدست + میانبرها، کاشی‌های تخت با جملهٔ مقایسه، فهرست‌ها با خط جداکننده و چیپ وضعیت
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { HandCoins, CheckSquare2, ChevronLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, formatTomanParts, toPersianDigits } from "@/lib/money"
import { formatJalaliShort, formatJalaliWithWeekday, JALALI_MONTHS, jalaliDayKey, jalaliOf, nowTehran } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { DashboardSkeleton } from "@/components/ui/page-skeletons"
import { ErrorState } from "@/components/ui/error-state"
import { BalanceAvatar } from "@/components/ui/role-avatar"
import { dueLabel, formatOpenDays, greeting } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/layout/page-header"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"
import { TrendChart, CollectionDonut, Sparkline, type Collection } from "@/components/charts/finance-charts"

/** ردیف طلب/بدهی داشبورد — openDays = چند روز است مانده باز است */
interface PersonBalanceRow {
  id: string
  name: string
  phone: string | null
  role: string | null
  balance: number
  openDays: number | null
}

interface DashboardData {
  today: PeriodSum
  week: PeriodSum
  month: PeriodSum
  prevMonth: PeriodSum
  monthComparison: Comparison
  /** مقایسهٔ هم‌بازه: امروز/دیروز، هفته تا امروز/همان روزهای هفتهٔ قبل، ماه تا امروز/همان روزهای ماه قبل */
  comparison: { day: Comparison; week: Comparison; month: Comparison }
  accounts: { id: string; name: string; bankKey: string; balance: number }[]
  totalBankBalance: number
  debtors: PersonBalanceRow[]
  creditors: PersonBalanceRow[]
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

type Comparison = { sales: number | null; purchases: number | null; profit: number | null; saleCount: number | null }

interface PeriodSum {
  sales: number
  purchases: number
  profit: number
  saleCount: number
  purchaseCount: number
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

/** کاشی KPI (نسخهٔ ۷) — مبلغ به رنگ متن؛ رنگ فقط برای توضیح/جهت تغییر */
function KpiTile({
  href,
  label,
  value,
  note,
  noteTone = "muted",
  spark,
}: {
  href: string
  label: string
  value: number
  note?: React.ReactNode
  noteTone?: "good" | "bad" | "warn" | "muted"
  /** مینی‌ترند روزانه (از اول ماه تا امروز) */
  spark?: number[]
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-3xl border border-border/80 bg-card p-3.5 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-card-hover active:scale-[0.98] sm:p-4"
    >
      <p className="truncate text-label font-semibold text-muted-foreground">{label}</p>
      <Amt v={value} className="mt-0.5 text-xl font-extrabold tracking-tight" />
      {note && (
        <p
          className={cn(
            "mt-0.5 truncate text-caption font-bold",
            noteTone === "good" && "text-income",
            noteTone === "bad" && "text-destructive",
            noteTone === "warn" && "text-warning-ink",
            noteTone === "muted" && "font-semibold text-muted-foreground"
          )}
        >
          {note}
        </p>
      )}
      {spark && <Sparkline values={spark} muted color="var(--primary)" height={24} className="mt-auto pt-2" />}
    </Link>
  )
}

/** متن مقایسه با دورهٔ قبل: «↑ ۱۲٪ از مهر» */
function deltaNote(pct: number | null, prevLabel: string, invert = false): { text: string; tone: "good" | "bad" | "muted" } | null {
  if (pct === null) return null
  if (pct === 0) return { text: `بدون تغییر نسبت به ${prevLabel}`, tone: "muted" }
  const good = invert ? pct < 0 : pct > 0
  return { text: `${pct > 0 ? "↑" : "↓"} ${toPersianDigits(Math.abs(pct))}٪ از ${prevLabel}`, tone: good ? "good" : "bad" }
}

/** تغییر درصدی روی کارت قهرمان سبز: «↑ ۱۲٪» — سبز روشن خوب، صورتی بد، خنثی برای خرید */
function HeroDelta({
  pct,
  prevLabel,
  neutral = false,
  className,
}: {
  pct: number | null
  /** «هفتهٔ قبل» — وقتی دورهٔ قبل صفر بوده درصد معنا ندارد: «هفتهٔ قبل ۰» */
  prevLabel: string
  neutral?: boolean
  className?: string
}) {
  if (pct === null)
    return <span className={cn("nums text-caption font-semibold text-white/60", className)}>{prevLabel} ۰</span>
  return (
    <span
      className={cn(
        "nums inline-flex items-center gap-0.5 text-caption font-bold",
        pct === 0 || neutral ? "text-white/75" : pct > 0 ? "text-[#a7f0cd]" : "text-[#ffc4bc]",
        className
      )}
    >
      {pct === 0 ? "بدون تغییر" : `${pct > 0 ? "↑" : "↓"} ${toPersianDigits(Math.abs(pct))}٪`}
    </span>
  )
}

/** کارت بخش (نسخهٔ ۷) — سربرگ با عنوان + جمع کوتاه + «همه»؛ ردیف‌ها با خط جداکننده، نه قاب جدا */
function SectionCard({
  title,
  sub,
  href,
  children,
  className,
}: {
  title: string
  sub?: React.ReactNode
  href?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-3xl border border-border/80 bg-card", className)}>
      <div className="flex items-baseline gap-2 px-4 pb-1 pt-3.5">
        <h2 className="shrink-0 whitespace-nowrap text-body font-extrabold">{title}</h2>
        {sub && <span className="nums min-w-0 truncate text-caption font-semibold text-muted-foreground">{sub}</span>}
        {href && (
          <Link
            href={href}
            className="ms-auto flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-label font-bold text-primary transition-colors hover:bg-primary/10"
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

/** ردیف یکدست داخل کارت بخش */
function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50">
      {children}
    </Link>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-5 pt-3 text-center text-label text-muted-foreground">{children}</p>
}

function DueChip({ daysLeft, label }: { daysLeft: number; label: string }) {
  return (
    <span
      className={cn(
        "nums inline-block rounded-full px-2 py-0.5 text-caption font-bold leading-4",
        daysLeft < 0
          ? "bg-destructive/10 text-destructive"
          : daysLeft === 0
            ? "bg-warning/15 text-warning-ink"
            : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

const QUICK_ACTIONS = [
  { href: "/invoices/new", label: "فروش", icon: ArrowDownLeft, tone: "sale" },
  { href: "/invoices/new?type=PURCHASE", label: "خرید", icon: ArrowUpRight, tone: "purchase" },
  { href: "/people?filter=debtors", label: "دریافت", icon: HandCoins, tone: "sale" },
  { href: "/checks", label: "چک‌ها", icon: CheckSquare2, tone: "warn" },
] as const

export default function DashboardPage() {
  // ردیف پایین کارت قهرمان: هفته یا ماه، هر کدام در برابر دورهٔ قبلش
  const [heroPeriod, setHeroPeriod] = useState<"week" | "month">("week")
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
    refetchInterval: 60_000,
    retry: 1,
  })

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
  const monthName = JALALI_MONTHS[j.jm - 1]
  const prevMonthName = JALALI_MONTHS[(j.jm + 10) % 12]
  // مقایسه با دیروز
  const yesterdayK = jalaliDayKey(new Date(now.getTime() - 86_400_000))
  const yesterdaySales = data.series.find((s) => s.day === yesterdayK)?.sales ?? 0
  const vsYesterday = data.comparison.day.sales
  const heroStats = heroPeriod === "week" ? data.week : data.month
  const heroCmp = heroPeriod === "week" ? data.comparison.week : data.comparison.month
  const profitNote = deltaNote(data.monthComparison.profit, prevMonthName)
  const salesNote = deltaNote(data.monthComparison.sales, prevMonthName)
  const overdueDebtors = data.debtors.filter((p) => (p.openDays ?? 0) > 30).length

  return (
    <div className="space-y-4">
      <PageHeader title="داشبورد" sub={`${formatJalaliWithWeekday(now)} | ${greeting(now)}`} className="!mb-0" />
      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* ───────── کارت قهرمان + میانبرها ───────── */}
        <div>
          <div className="hero-solid relative overflow-hidden rounded-3xl p-5 text-white sm:p-6">
            <div className="flex items-center gap-2 text-label font-semibold text-white/85">
              فروش امروز
              {data.today.saleCount > 0 && vsYesterday !== null ? (
                <span className="nums ms-auto rounded-full bg-white/15 px-2.5 py-0.5 text-caption font-bold text-white">
                  {vsYesterday === 0
                    ? "هم‌اندازهٔ دیروز"
                    : `${vsYesterday > 0 ? "↑" : "↓"} ${toPersianDigits(Math.abs(vsYesterday))}٪ از دیروز`}
                </span>
              ) : data.today.saleCount === 0 && yesterdaySales > 0 ? (
                <span className="nums ms-auto rounded-full bg-white/15 px-2.5 py-0.5 text-caption font-bold text-white/90">
                  دیروز {formatTomanCompact(yesterdaySales)}
                </span>
              ) : null}
            </div>
            {data.today.saleCount > 0 ? (
              <>
                <p className="nums mt-1.5 text-display font-black tracking-tight">
                  {formatToman(data.today.sales, false)}
                  <span className="ms-1.5 text-body font-semibold tracking-normal text-white/65">تومان</span>
                </p>
                <p className="nums mt-0.5 text-label text-white/80">
                  {toPersianDigits(data.today.saleCount)} فاکتور | سود {formatToman(data.today.profit, false)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-page font-black">هنوز فروشی ثبت نشده</p>
                <p className="mt-1 text-label text-white/80">اولین فروش امروز را با دکمهٔ + ثبت کنید</p>
              </>
            )}
            <div className="mt-4 border-t border-white/15 pt-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div role="tablist" aria-label="دورهٔ خلاصه" className="flex rounded-full bg-black/15 p-0.5">
                  {(
                    [
                      ["week", "این هفته"],
                      ["month", "این ماه"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={heroPeriod === k}
                      onClick={() => setHeroPeriod(k)}
                      className={cn(
                        "h-7 rounded-full px-3 text-caption font-bold transition-colors",
                        heroPeriod === k ? "bg-white text-[#0a6a55]" : "text-white/75 hover:text-white"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="truncate text-caption text-white/65">
                  {heroPeriod === "week" ? "در برابر هفتهٔ قبل" : `در برابر همین روزهای ${prevMonthName}`}
                </span>
              </div>
              <div className="grid grid-cols-3">
                {(
                  [
                    ["فروش", heroStats.sales, heroCmp.sales, false],
                    ["سود", heroStats.profit, heroCmp.profit, false],
                    ["خرید", heroStats.purchases, heroCmp.purchases, true],
                  ] as const
                ).map(([label, v, d, neutral], i) => (
                  <div key={label} className={cn("min-w-0", i > 0 && "border-s border-white/15 ps-3")}>
                    <p className="text-caption text-white/70">{label}</p>
                    <Amt v={v} className="text-body font-extrabold" unitClassName="opacity-70" />
                    <HeroDelta
                      pct={d}
                      prevLabel={heroPeriod === "week" ? "هفتهٔ قبل" : prevMonthName}
                      neutral={neutral}
                      className="mt-0.5 flex truncate"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon, tone }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-1.5 rounded-2xl border border-border/80 bg-card px-1 pb-2.5 pt-3 text-label font-bold transition-colors hover:border-primary/30 active:scale-[0.97]"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-xl",
                    tone === "sale" && "bg-sale/10 text-sale",
                    tone === "purchase" && "bg-purchase/10 text-purchase",
                    tone === "warn" && "bg-warning/15 text-warning-ink"
                  )}
                >
                  <Icon className="size-[1.15rem]" strokeWidth={2.2} />
                </span>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* ───────── کاشی‌های KPI ───────── */}
        <div className="grid grid-cols-2 gap-2.5">
          <KpiTile
            href="/reports"
            label={`سود ${monthName}`}
            value={data.month.profit}
            note={profitNote?.text ?? `از اول ${monthName}`}
            noteTone={profitNote?.tone ?? "muted"}
            spark={monthDays.map((d) => d.profit)}
          />
          <KpiTile
            href="/reports"
            label={`فروش ${monthName}`}
            value={data.month.sales}
            note={salesNote?.text ?? `${toPersianDigits(data.month.saleCount)} فاکتور از اول ${monthName}`}
            noteTone={salesNote?.tone ?? "muted"}
            spark={monthDays.map((d) => d.sales)}
          />
          <KpiTile
            href="/people?filter=debtors"
            label="طلب از مشتریان"
            value={data.totalReceivable}
            note={
              overdueDebtors > 0
                ? `${toPersianDigits(overdueDebtors)} نفر بیش از ۳۰ روز`
                : `${toPersianDigits(data.debtors.length)} نفر`
            }
            noteTone={overdueDebtors > 0 ? "warn" : "muted"}
          />
          <KpiTile
            href="/people?filter=creditors"
            label="بدهی به فروشنده‌ها"
            value={data.totalPayable}
            note={`${toPersianDigits(data.creditors.length)} فروشنده`}
          />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        {/* ───────── ستون اصلی ───────── */}
        <div className="space-y-4 lg:col-span-3">
          <div>
            <SectionCard title="روند فروش و سود">
              <div className="px-4 pb-4 pt-1">
                <TrendChart series={data.series} height={210} />
              </div>
            </SectionCard>
          </div>

          <div>
            <SectionCard title={`وصول فروش ${monthName}`}>
              <div className="px-4 pb-4 pt-1">
                <CollectionDonut data={data.monthCollection} />
              </div>
            </SectionCard>
          </div>

          {/* طلب‌ها و بدهی‌ها */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard
              title="طلب از مشتریان"
              sub={`${formatTomanCompact(data.totalReceivable)} | ${toPersianDigits(data.debtors.length)} نفر`}
              href="/people?filter=debtors"
            >
              <div className="divide-y divide-border/60 pb-1">
                {data.debtors.slice(0, 5).map((p) => (
                  <BalanceRow key={p.id} p={p} />
                ))}
              </div>
              {data.debtors.length === 0 && <EmptyLine>طلبی روی کسی نیست</EmptyLine>}
            </SectionCard>

            <SectionCard
              title="بدهی به فروشنده‌ها"
              sub={`${formatTomanCompact(data.totalPayable)} | ${toPersianDigits(data.creditors.length)} نفر`}
              href="/people?filter=creditors"
            >
              <div className="divide-y divide-border/60 pb-1">
                {data.creditors.slice(0, 5).map((p) => (
                  <BalanceRow key={p.id} p={p} />
                ))}
              </div>
              {data.creditors.length === 0 && <EmptyLine>به کسی بدهکار نیستید</EmptyLine>}
            </SectionCard>
          </div>

          {/* آخرین فاکتورها */}
          <div>
            <SectionCard title="آخرین فاکتورها" href="/invoices">
              <div className="divide-y divide-border/60 pb-1">
                {data.recentInvoices.map((inv) => (
                  <Row key={inv.id} href={`/invoices/${inv.id}`}>
                    <InvoiceTypeMark type={inv.type} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{inv.person.name}</div>
                      <div className="nums mt-0.5 truncate text-caption text-muted-foreground">
                        {inv.type === "SALE" ? "فروش" : "خرید"} | {formatJalaliShort(new Date(inv.date))} | ش{" "}
                        {toPersianDigits(inv.number)}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="nums text-sm font-extrabold">{formatTomanCompact(inv.total)}</div>
                      <span
                        className={cn(
                          "mt-0.5 inline-block rounded-full px-2 py-0.5 text-caption font-bold leading-4",
                          inv.status === "SETTLED" ? "bg-income/10 text-income" : "bg-warning/15 text-warning-ink"
                        )}
                      >
                        {inv.status === "SETTLED" ? "تسویه" : "نسیه"}
                      </span>
                    </div>
                  </Row>
                ))}
              </div>
              {data.recentInvoices.length === 0 && (
                <EmptyLine>هنوز فاکتوری ثبت نشده — از دکمهٔ + شروع کنید</EmptyLine>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ───────── ستون کنار ───────── */}
        <div className="space-y-4 lg:col-span-2">
          <div>
            <SectionCard
              title="چک‌های پیش رو"
              sub={`دریافتی ${formatTomanCompact(data.checks.pendingReceivedTotal)} | صادره ${formatTomanCompact(data.checks.pendingIssuedTotal)}`}
              href="/checks"
            >
              <div className="divide-y divide-border/60 pb-1">
                {data.checks.upcoming.slice(0, 5).map((c) => (
                  <Row key={c.id} href="/checks">
                    <BankLogo bankKey={c.bankKey} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold">{c.person.name}</span>
                        <CheckDirectionBadge direction={c.direction} size="sm" />
                      </div>
                      <div className="nums mt-0.5 truncate text-caption text-muted-foreground">
                        سررسید {formatJalaliShort(new Date(c.dueDate))}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="nums text-sm font-extrabold">{formatTomanCompact(c.amount)}</div>
                      <DueChip daysLeft={c.daysLeft} label={dueLabel(new Date(c.dueDate), now)} />
                    </div>
                  </Row>
                ))}
              </div>
              {data.checks.upcoming.length === 0 && <EmptyLine>چکی در جریان نیست</EmptyLine>}
            </SectionCard>
          </div>

          <div>
            <SectionCard title="حساب‌های بانکی" sub={formatTomanCompact(data.totalBankBalance)} href="/accounts">
              <div className="divide-y divide-border/60 pb-1">
                {data.accounts.map((a) => (
                  <Row key={a.id} href="/accounts">
                    <BankLogo bankKey={a.bankKey} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{a.name}</div>
                      <div className="text-caption text-muted-foreground">{getBank(a.bankKey).name}</div>
                    </div>
                    <span className="nums shrink-0 text-sm font-extrabold">{formatToman(a.balance, false)}</span>
                  </Row>
                ))}
              </div>
              {data.accounts.length === 0 && <EmptyLine>هنوز حساب بانکی نساخته‌اید</EmptyLine>}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  )
}

/** ردیف طلب/بدهی — آواتار نقش (رنگ = وضعیت حساب) + قدمت با متن */
function BalanceRow({ p }: { p: PersonBalanceRow }) {
  const overdue = p.openDays != null && p.openDays > 30
  return (
    <Row href={`/people/${p.id}`}>
      <BalanceAvatar role={p.role} balance={p.balance} openDays={p.openDays} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{p.name}</div>
        {p.openDays != null && (
          <div className={cn("nums truncate text-caption", overdue ? "font-bold text-destructive" : "text-muted-foreground")}>
            {overdue ? `${formatOpenDays(p.openDays)} بدون تسویه` : `باز از ${formatOpenDays(p.openDays)} پیش`}
          </div>
        )}
      </div>
      <span className="nums shrink-0 text-sm font-extrabold">{formatTomanCompact(Math.abs(p.balance))}</span>
    </Row>
  )
}
