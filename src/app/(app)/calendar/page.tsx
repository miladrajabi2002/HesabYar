"use client"

/**
 * تقویم مالی (ADV-05) — نمای ماهانه شمسی از رویدادهای مالی فروشگاه
 * چک‌های سررسید، فاکتورهای فروش/خرید و تسویه‌ها روی روزهای ماه.
 * API: GET /api/calendar?month=1404-08
 */
import { useMemo, useState, type ReactNode, useRef } from "react"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HandCoins,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import {
  JALALI_MONTHS,
  WEEKDAYS,
  currentMonthKey,
  parseMonthKey,
  dayKeyToDate,
  formatJalaliWithWeekday,
  monthKeyLabel,
  nextMonthKey,
  previousMonthKey,
} from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { useTelegramBackButton } from "@/hooks/use-telegram"
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"
import { cn } from "@/lib/utils"
import { InvoiceTypeMark } from "@/components/ui/type-mark"

// ───────────────────────── انواع ─────────────────────────

interface CalendarCheck {
  id: string
  amount: number
  bankKey: string
  direction: string // RECEIVED | ISSUED
  status: string // PENDING | CASHED | BOUNCED | CANCELED
  serial: string
  person: { name: string }
}

interface CalendarInvoice {
  id: string
  number: number
  type: string // SALE | PURCHASE
  total: number
  person: { name: string }
}

interface CalendarSettlement {
  id: string
  amount: number
  direction: string // RECEIVE | PAY
  method: string // CASH | CHECK
  person: { name: string }
}

interface DayEvents {
  checks: CalendarCheck[]
  invoices: CalendarInvoice[]
  settlements: CalendarSettlement[]
}

interface CalendarResponse {
  month: string
  monthLabel: string
  firstWeekday: number // ۰ = شنبه (شبکه شنبه‌محور)
  monthLength: number
  todayKey: string
  days: Record<string, DayEvents>
}

// ───────────────────────── برچسب‌ها (هماهنگ با صفحه چک‌ها) ─────────────────────────

const CHECK_STATUS_LABEL: Record<string, string> = {
  PENDING: "در جریان",
  CASHED: "پاس‌شده",
  BOUNCED: "برگشت خورده",
  CANCELED: "لغو‌شده",
}

const CHECK_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-primary/10 text-primary",
  CASHED: "bg-income/10 text-income",
  BOUNCED: "bg-destructive/10 text-destructive",
  CANCELED: "bg-muted text-muted-foreground",
}

const DOT = {
  sale: "bg-[color:var(--sale)]",
  purchase: "bg-[color:var(--purchase)]",
  check: "bg-[color:var(--hue-checks)]",
  settle: "bg-[color:var(--role-customer)]",
} as const

const LEGEND = [
  { dot: DOT.sale, label: "فروش" },
  { dot: DOT.purchase, label: "خرید" },
  { dot: DOT.check, label: "سررسید چک" },
  { dot: DOT.settle, label: "تسویه" },
] as const

/** انواع نشانگر یک روز — حداکثر ۳ نقطه در سلول (بدون عدد؛ جزئیات در برنامهٔ روز) */
function dayKinds(events: DayEvents): Array<{ dot: string; count: number }> {
  const sales = events.invoices.filter((i) => i.type === "SALE").length
  const purchases = events.invoices.filter((i) => i.type === "PURCHASE").length
  const kinds: Array<{ dot: string; count: number }> = []
  if (events.checks.length > 0) kinds.push({ dot: DOT.check, count: events.checks.length })
  if (sales > 0) kinds.push({ dot: DOT.sale, count: sales })
  if (purchases > 0) kinds.push({ dot: DOT.purchase, count: purchases })
  if (events.settlements.length > 0) kinds.push({ dot: DOT.settle, count: events.settlements.length })
  return kinds.slice(0, 3)
}

// ───────────────────────── اجزای کوچک ─────────────────────────

function CalendarSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]" aria-busy="true" aria-label="در حال بارگذاری تقویم">
      <div className="rounded-3xl border border-border bg-card p-3.5">
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl lg:h-14" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────── انتخاب ماه/سال ─────────────────────────

/** جابه‌جایی کلید ماه به اندازهٔ n ماه (مثبت = جلو) */
function shiftMonth(key: string, n: number): string {
  const { jy, jm } = parseMonthKey(key)
  const idx = jy * 12 + (jm - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
}

function MonthPickerSheet({
  open,
  onClose,
  month,
  onPick,
}: {
  open: boolean
  onClose: () => void
  month: string
  onPick: (key: string) => void
}) {
  const cur = currentMonthKey()
  const [year, setYear] = useState(() => parseMonthKey(month).jy)
  const [prevOpen, setPrevOpen] = useState(open)
  // هر بار شیت باز می‌شود، روی سالِ ماه انتخاب‌شده می‌ایستد
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setYear(parseMonthKey(month).jy)
  }
  const curYear = parseMonthKey(cur).jy
  const jumps = [
    { label: "۳ ماه قبل", n: -3 },
    { label: "۶ ماه قبل", n: -6 },
    { label: "۹ ماه قبل", n: -9 },
    { label: "سال قبل", n: -12 },
  ]
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="رفتن به ماه یا سال"
      description="هر ماه یا سالی را مستقیم باز کنید"
      footer={
        <Button
          variant="outline"
          className="h-12 w-full rounded-2xl font-bold"
          onClick={() => {
            onPick(cur)
            onClose()
          }}
        >
          <CalendarDays className="size-4" />
          برگرد به امروز
        </Button>
      }
    >
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-muted/60 p-1.5">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          aria-label="سال قبل"
          className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-card active:scale-95"
        >
          <ChevronRight className="size-5" />
        </button>
        <div className="text-center">
          <div className="nums text-xl font-black leading-none">{toPersianDigits(year)}</div>
          <div className="mt-1 text-caption text-muted-foreground">
            {year === curYear ? "سال جاری" : year < curYear ? `${toPersianDigits(curYear - year)} سال قبل` : `${toPersianDigits(year - curYear)} سال بعد`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          aria-label="سال بعد"
          className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-card active:scale-95"
        >
          <ChevronLeft className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {JALALI_MONTHS.map((name, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`
          const selected = key === month
          const isCurrent = key === cur
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onPick(key)
                onClose()
              }}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-2xl border py-3 transition-all active:scale-95",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-card"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent/50"
              )}
            >
              <span className="text-label font-extrabold">{name}</span>
              <span className={cn("nums text-caption", selected ? "opacity-80" : "text-muted-foreground")}>
                {toPersianDigits(i + 1)}
              </span>
              {isCurrent && (
                <span
                  aria-label="ماه جاری"
                  className={cn("absolute end-2 top-2 size-1.5 rounded-full", selected ? "bg-primary-foreground" : "bg-primary")}
                />
              )}
            </button>
          )
        })}
      </div>

      <p className="mb-2 mt-4 text-caption font-bold text-muted-foreground">پرش سریع از ماه انتخاب‌شده</p>
      <div className="flex flex-wrap gap-1.5">
        {jumps.map((j) => (
          <button
            key={j.n}
            type="button"
            onClick={() => {
              onPick(shiftMonth(month, j.n))
              onClose()
            }}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-caption font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95"
          >
            {j.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

// ───────────────────────── صفحه ─────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  useTelegramBackButton()

  const [month, setMonth] = useState<string>(() => currentMonthKey())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // جهت تغییر ماه برای انیمیشن لغزشی (۱ = ماه بعد، −۱ = ماه قبل)
  const [dir, setDir] = useState(0)
  const draggedRef = useRef(false)

  const {
    data,
    isError,
    error,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: ["calendar", month],
    queryFn: () => apiGet<CalendarResponse>(`/api/calendar?month=${month}`),
    placeholderData: keepPreviousData,
  })

  // خلاصه ماه — چک‌های «در جریان»، فروش، خرید و تسویه
  const summary = useMemo(() => {
    if (!data) return null
    let pendingChecks = 0
    let pendingChecksSum = 0
    let allChecks = 0
    let salesCount = 0
    let salesSum = 0
    let purchaseCount = 0
    let purchaseSum = 0
    let settleCount = 0
    let settleSum = 0
    for (const day of Object.values(data.days)) {
      for (const c of day.checks) {
        allChecks += 1
        if (c.status === "PENDING") {
          pendingChecks += 1
          pendingChecksSum += c.amount
        }
      }
      for (const inv of day.invoices) {
        if (inv.type === "SALE") {
          salesCount += 1
          salesSum += inv.total
        } else if (inv.type === "PURCHASE") {
          purchaseCount += 1
          purchaseSum += inv.total
        }
      }
      for (const s of day.settlements) {
        settleCount += 1
        settleSum += s.amount
      }
    }
    return {
      pendingChecks,
      pendingChecksSum,
      allChecks,
      salesCount,
      salesSum,
      purchaseCount,
      purchaseSum,
      settleCount,
      settleSum,
      totalEvents: allChecks + salesCount + purchaseCount + settleCount,
    }
  }, [data])

  // سلول‌های شبکه: خالی‌های ابتدای ماه + روزهای ۱ تا طول ماه
  const cells = useMemo<Array<number | null>>(() => {
    if (!data) return []
    return [
      ...Array.from({ length: data.firstWeekday }, () => null),
      ...Array.from({ length: data.monthLength }, (_, i) => i + 1),
    ]
  }, [data])

  const goPrev = () => {
    setDir(-1)
    setSelectedDay(null)
    setMonth(previousMonthKey(month))
  }
  const goNext = () => {
    setDir(1)
    setSelectedDay(null)
    setMonth(nextMonthKey(month))
  }
  const jumpTo = (key: string) => {
    if (key === month) return
    setDir(key > month ? 1 : -1)
    setSelectedDay(null)
    setMonth(key)
  }
  const goToday = () => {
    const cur = currentMonthKey()
    setSelectedDay(null)
    if (month === cur) return
    setDir(cur > month ? 1 : -1)
    setMonth(cur)
  }

  const { jm } = parseMonthKey(month)
  const monthName = JALALI_MONTHS[jm - 1]
  // روز برنامه: انتخاب کاربر، وگرنه امروز (اگر در همین ماه باشد)
  const agendaDay = selectedDay ?? (data && data.todayKey.startsWith(data.month) ? data.todayKey : null)
  const agenda = agendaDay && data ? data.days[agendaDay] : undefined
  const agendaSales = agenda ? agenda.invoices.filter((x) => x.type === "SALE").reduce((a, x) => a + x.total, 0) : 0
  const agendaCount = agenda ? agenda.checks.length + agenda.invoices.length + agenda.settlements.length : 0

  return (
    <div className="mx-auto max-w-2xl lg:max-w-6xl">
      <PageHeader
        title="تقویم مالی"
        sub={summary ? `${monthKeyLabel(month)} | ${toPersianDigits(summary.totalEvents)} رویداد` : monthKeyLabel(month)}
      />

      {isError ? (
        <ErrorState
          message="بارگذاری تقویم ناموفق بود"
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : !data ? (
        <CalendarSkeleton />
      ) : (
        <div
          aria-busy={isPlaceholderData}
          className={cn(
            "grid items-start gap-4 transition-opacity lg:grid-cols-[1.2fr_1fr] lg:gap-5",
            isPlaceholderData && "pointer-events-none opacity-60"
          )}
        >
          {/* ───────── شبکهٔ تقویم — شنبه‌محور ───────── */}
          <section aria-label="تقویم ماه" className="rounded-3xl border border-border bg-card p-3.5 lg:p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <h2 className="min-w-0 flex-1" aria-live="polite">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="انتخاب ماه یا سال"
                  className="-ms-1.5 flex max-w-full items-center gap-1 rounded-xl px-1.5 py-1 text-title font-extrabold transition-colors hover:bg-accent"
                >
                  <span className="truncate">{monthKeyLabel(month)}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </h2>
              <Button variant="outline" className="h-9 rounded-xl px-3 text-label font-bold" onClick={goToday}>
                امروز
              </Button>
              <Button variant="outline" size="icon" className="size-9 rounded-xl" onClick={goPrev} aria-label="ماه قبل">
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="size-9 rounded-xl" onClick={goNext} aria-label="ماه بعد">
                <ChevronLeft className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 pb-1">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "text-center text-caption font-bold",
                    i === 6 ? "text-destructive/75" : "text-muted-foreground"
                  )}
                >
                  <span className="lg:hidden">{w[0]}</span>
                  <span className="hidden lg:inline">{w}</span>
                </div>
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={data.month}
                custom={dir}
                initial={{ opacity: 0, x: -dir * 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * 36 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                dragDirectionLock
                onDragStart={() => {
                  draggedRef.current = true
                }}
                onClickCapture={(e) => {
                  // کلیک پایانِ کشیدن روی یک روز نباید آن روز را انتخاب کند
                  if (draggedRef.current) {
                    e.stopPropagation()
                    e.preventDefault()
                  }
                  draggedRef.current = false
                }}
                onPointerDown={() => {
                  draggedRef.current = false
                }}
                onDragEnd={(_, info) => {
                  // کشیدن به راست → ماه بعد (تقویم راست‌به‌چپ) • به چپ → ماه قبل
                  if (info.offset.x > 70) goNext()
                  else if (info.offset.x < -70) goPrev()
                }}
                style={{ touchAction: "pan-y" }}
                className="grid grid-cols-7 gap-0.5"
              >
                {cells.map((dayNumber, i) => {
                  if (dayNumber === null) return <div key={`pad-${i}`} aria-hidden="true" />
                  const dayKey = `${data.month}-${String(dayNumber).padStart(2, "0")}`
                  const events = data.days[dayKey]
                  const count = events ? events.checks.length + events.invoices.length + events.settlements.length : 0
                  const isToday = data.todayKey === dayKey
                  const isSelected = agendaDay === dayKey
                  const isFriday = (data.firstWeekday + dayNumber - 1) % 7 === 6
                  const kinds = events ? dayKinds(events) : []
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => setSelectedDay(dayKey)}
                      aria-pressed={isSelected}
                      aria-label={`${toPersianDigits(dayNumber)} ${monthKeyLabel(data.month)}${count ? ` — ${toPersianDigits(count)} رویداد` : ""}${isToday ? " (امروز)" : ""}`}
                      className={cn(
                        "flex h-11 flex-col items-center justify-center gap-[3px] rounded-xl text-sm transition-colors lg:h-14",
                        isSelected
                          ? "bg-primary font-extrabold text-primary-foreground"
                          : cn("hover:bg-accent", isToday && "font-extrabold ring-[1.5px] ring-inset ring-primary"),
                        !isSelected && (isFriday ? "text-destructive/75" : "font-medium")
                      )}
                    >
                      <span className="nums leading-none">{toPersianDigits(dayNumber)}</span>
                      <span className="flex h-[5px] gap-[3px]" aria-hidden="true">
                        {kinds.map((k) => (
                          <span key={k.dot} className={cn("size-[5px] rounded-full", isSelected ? "bg-white" : k.dot)} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </motion.div>
            </AnimatePresence>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1">
              {LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1 text-caption text-muted-foreground">
                  <span className={cn("size-2 rounded-full", l.dot)} aria-hidden="true" />
                  {l.label}
                </span>
              ))}
            </div>
          </section>

          {/* ───────── برنامهٔ روز انتخاب‌شده + خلاصهٔ ماه ───────── */}
          <div>
            <div className="mx-1 mb-2 flex items-baseline justify-between gap-2 lg:mt-0">
              <h2 className="text-label font-extrabold text-foreground/80">
                {agendaDay ? formatJalaliWithWeekday(dayKeyToDate(agendaDay)) : "روزی را انتخاب کنید"}
              </h2>
              {agendaSales > 0 && (
                <span className="nums text-caption font-semibold text-muted-foreground">فروش {formatTomanCompact(agendaSales)}</span>
              )}
            </div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              {agendaCount === 0 ? (
                <p className="px-4 py-6 text-center text-label text-muted-foreground">
                  {agendaDay ? "در این روز رویداد مالی ثبت نشده" : "روی یک روز تقویم بزنید تا رویدادهایش اینجا بیاید"}
                </p>
              ) : (
                <div className="divide-y divide-border/70">
                  {agenda!.checks.map((c) => (
                    <AgendaRow
                      key={c.id}
                      onClick={() => router.push("/checks")}
                      lead={<BankLogo bankKey={c.bankKey} size={40} />}
                      title={c.person.name}
                      sub={`چک ${c.direction === "RECEIVED" ? "دریافتی" : "صادره"} | ${getBank(c.bankKey).name}`}
                      amount={formatToman(c.amount, false)}
                      chip={
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-caption font-bold", CHECK_STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground")}>
                          {CHECK_STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      }
                    />
                  ))}
                  {agenda!.invoices.map((inv) => (
                    <AgendaRow
                      key={inv.id}
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                      lead={<InvoiceTypeMark type={inv.type} size={40} />}
                      title={inv.person.name}
                      sub={`فاکتور ${inv.type === "PURCHASE" ? "خرید" : "فروش"} #${toPersianDigits(inv.number)}`}
                      amount={formatToman(inv.total, false)}
                    />
                  ))}
                  {agenda!.settlements.map((st) => (
                    <AgendaRow
                      key={st.id}
                      lead={
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-xl",
                            st.direction === "RECEIVE" ? "bg-sale/10 text-sale" : "bg-purchase/10 text-purchase"
                          )}
                        >
                          <HandCoins className="size-5" />
                        </span>
                      }
                      title={st.person.name}
                      sub={`${st.direction === "RECEIVE" ? "دریافت" : "پرداخت"} ${st.method === "CASH" ? "نقدی" : "چکی"}`}
                      amount={`${st.direction === "RECEIVE" ? "+" : "−"}${formatToman(st.amount, false)}`}
                      amountClass={st.direction === "RECEIVE" ? "text-sale" : "text-purchase"}
                    />
                  ))}
                </div>
              )}
            </div>

            {summary && (
              <>
                <h2 className="mx-1 mb-2 mt-5 text-label font-extrabold text-foreground/80">خلاصهٔ {monthName}</h2>
                <div className="grid grid-cols-2 overflow-hidden rounded-3xl border border-border bg-card">
                  {(
                    [
                      ["فروش", formatTomanCompact(summary.salesSum), `${toPersianDigits(summary.salesCount)} فاکتور`],
                      ["خرید", formatTomanCompact(summary.purchaseSum), `${toPersianDigits(summary.purchaseCount)} فاکتور`],
                      [
                        "چک‌های سررسید",
                        `${toPersianDigits(summary.allChecks)} چک`,
                        summary.pendingChecks ? `${toPersianDigits(summary.pendingChecks)} در جریان | ${formatTomanCompact(summary.pendingChecksSum)}` : "همه تعیین تکلیف شده",
                      ],
                      ["تسویه‌ها", formatTomanCompact(summary.settleSum), `${toPersianDigits(summary.settleCount)} مورد`],
                    ] as const
                  ).map(([label, value, sub], i) => (
                    <div key={label} className={cn("min-w-0 px-4 py-3", i % 2 === 1 && "border-s border-border", i > 1 && "border-t border-border")}>
                      <p className="text-caption font-semibold text-muted-foreground">{label}</p>
                      <p className="nums truncate text-body font-extrabold">{value}</p>
                      <p className="nums truncate text-caption text-muted-foreground">{sub}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <MonthPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} month={month} onPick={jumpTo} />
    </div>
  )
}

/** ردیف برنامهٔ روز — یک قالب برای چک، فاکتور و تسویه */
function AgendaRow({
  lead,
  title,
  sub,
  amount,
  amountClass,
  chip,
  onClick,
}: {
  lead: ReactNode
  title: string
  sub: string
  amount: string
  amountClass?: string
  chip?: ReactNode
  onClick?: () => void
}) {
  const body = (
    <>
      {lead}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{title}</p>
        <p className="nums mt-0.5 truncate text-caption text-muted-foreground">{sub}</p>
      </div>
      <div className="shrink-0 text-end">
        <p className={cn("nums text-sm font-extrabold", amountClass)}>{amount}</p>
        {chip}
      </div>
    </>
  )
  const cls = "flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2.5 text-start"
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-accent/50")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
