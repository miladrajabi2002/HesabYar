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
import { toast } from "sonner"
import {
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  ReceiptText,
  ShoppingCart,
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

/** قاب ردیف چک داخل شیت بر اساس وضعیت */
function checkRowBorder(status: string): string {
  switch (status) {
    case "PENDING":
      return "border-destructive/25"
    case "CASHED":
      return "border-income/25"
    case "BOUNCED":
      return "border-destructive/40"
    default:
      return "border-border opacity-60"
  }
}

/** انواع نشانگر یک روز — حداکثر ۳ مورد در سلول */
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

function SummaryChip({
  icon,
  label,
  value,
  sub,
  tone,
  i = 0,
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
  tone: string
  i?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, type: "spring", stiffness: 380, damping: 30 }}
      style={{ ["--tile" as string]: tone }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-3.5 shadow-card"
    >
      <div className="flex items-center gap-1.5 text-[0.68rem] font-bold text-muted-foreground">
        <span className="icon-soft grid size-6 place-items-center rounded-lg">{icon}</span>
        {label}
      </div>
      <p className="nums mt-2 text-base font-extrabold sm:text-lg" style={{ color: "color-mix(in srgb, var(--tile) 85%, black)" }}>
        {value}
      </p>
      <p className="nums mt-0.5 text-[0.62rem] text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

function SheetSectionTitle({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {label}
      <span className="nums font-medium">({toPersianDigits(count)})</span>
    </h3>
  )
}

function CalendarSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری تقویم">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-border/70 bg-card p-3 shadow-card sm:p-4">
        <div className="grid grid-cols-7 gap-1 pb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`h${i}`} className="mx-auto h-2.5 w-9" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="min-h-[3.4rem] rounded-2xl lg:min-h-24" />
          ))}
        </div>
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
          <div className="mt-1 text-[0.62rem] text-muted-foreground">
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
              <span className="text-[0.82rem] font-extrabold">{name}</span>
              <span className={cn("nums text-[0.62rem]", selected ? "opacity-80" : "text-muted-foreground")}>
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

      <p className="mb-2 mt-4 text-[0.68rem] font-bold text-muted-foreground">پرش سریع از ماه انتخاب‌شده</p>
      <div className="flex flex-wrap gap-1.5">
        {jumps.map((j) => (
          <button
            key={j.n}
            type="button"
            onClick={() => {
              onPick(shiftMonth(month, j.n))
              onClose()
            }}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95"
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

  const selectedEvents = selectedDay && data ? data.days[selectedDay] : undefined
  const selectedCount = selectedEvents
    ? selectedEvents.checks.length + selectedEvents.invoices.length + selectedEvents.settlements.length
    : 0

  const goPrev = () => {
    setDir(-1)
    setMonth(previousMonthKey(month))
  }
  const goNext = () => {
    setDir(1)
    setMonth(nextMonthKey(month))
  }

  // شدت رنگ پس‌زمینهٔ هر روز بر اساس حجم فروش (نقشهٔ حرارتی ملایم)
  const maxDaySales = useMemo(() => {
    if (!data) return 0
    let m = 0
    for (const d of Object.values(data.days)) {
      const v = d.invoices.filter((i) => i.type === "SALE").reduce((a, i) => a + i.total, 0)
      if (v > m) m = v
    }
    return m
  }, [data])
  const jumpTo = (key: string) => {
    if (key === month) return
    setDir(key > month ? 1 : -1)
    setMonth(key)
  }
  const goToday = () => {
    const cur = currentMonthKey()
    if (month === cur) {
      toast.info("همین حالا در ماه جاری هستید")
      return
    }
    setDir(cur > month ? 1 : -1)
    setMonth(cur)
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-5xl">
      {/* هدر ماه */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-2xl"
          onClick={goPrev}
          aria-label="ماه قبل"
        >
          <ChevronRight className="size-4" />
        </Button>
        <h1 className="min-w-0 flex-1 text-center text-lg font-extrabold sm:text-xl" aria-live="polite">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="انتخاب ماه یا سال"
            className="mx-auto flex max-w-full items-center justify-center gap-1.5 rounded-2xl px-3 py-1.5 transition-colors hover:bg-accent active:scale-[0.98]"
          >
            <span className="truncate">{monthKeyLabel(month)}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </h1>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-2xl"
          onClick={goNext}
          aria-label="ماه بعد"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="h-11 shrink-0 rounded-2xl px-3 text-xs font-bold"
          onClick={goToday}
        >
          <CalendarDays className="size-4" />
          امروز
        </Button>
      </div>

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
          className={cn("space-y-4 transition-opacity", isPlaceholderData && "pointer-events-none opacity-60")}
        >
          {/* خلاصه ماه */}
          {summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryChip
                icon={<CheckSquare2 className="size-3.5" />}
                label="چک‌های این ماه"
                value={formatTomanCompact(summary.pendingChecksSum)}
                sub={`${toPersianDigits(summary.allChecks)} فقره در ماه • ${toPersianDigits(summary.pendingChecks)} در جریان`}
                tone="var(--hue-checks)"
                i={0}
              />
              <SummaryChip
                icon={<ReceiptText className="size-3.5" />}
                label="فروش این ماه"
                value={formatTomanCompact(summary.salesSum)}
                sub={`${toPersianDigits(summary.salesCount)} فاکتور فروش`}
                tone="var(--sale)"
                i={1}
              />
              <SummaryChip
                icon={<ShoppingCart className="size-3.5" />}
                label="خرید این ماه"
                value={formatTomanCompact(summary.purchaseSum)}
                sub={`${toPersianDigits(summary.purchaseCount)} فاکتور خرید`}
                tone="var(--purchase)"
                i={2}
              />
              <SummaryChip
                icon={<HandCoins className="size-3.5" />}
                label="تسویه‌های این ماه"
                value={formatTomanCompact(summary.settleSum)}
                sub={`${toPersianDigits(summary.settleCount)} تسویه`}
                tone="var(--role-customer)"
                i={3}
              />
            </div>
          )}

          {/* شبکه تقویم — شنبه‌محور */}
          <section aria-label="تقویم ماه" className="rounded-3xl border border-border/70 bg-card p-3 shadow-card sm:p-4">
            <div className="grid grid-cols-7 gap-1 pb-2">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "text-center text-[0.6rem] font-bold whitespace-nowrap sm:text-[0.7rem]",
                    i === 6 ? "text-destructive/70" : "text-muted-foreground"
                  )}
                >
                  {w}
                </div>
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={data.month}
              custom={dir}
              initial={{ opacity: 0, x: -dir * 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * 48 }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              dragDirectionLock
              onDragStart={() => {
                draggedRef.current = true
              }}
              onClickCapture={(e) => {
                // کلیک پایانِ کشیدن روی یک روز نباید شیت آن روز را باز کند
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
              className="grid grid-cols-7 gap-1"
            >
              {cells.map((dayNumber, i) => {
                if (dayNumber === null) {
                  return <div key={`pad-${i}`} aria-hidden="true" className="min-h-[3.4rem] lg:min-h-24" />
                }
                const dayKey = `${data.month}-${String(dayNumber).padStart(2, "0")}`
                const events = data.days[dayKey]
                const totalCount = events
                  ? events.checks.length + events.invoices.length + events.settlements.length
                  : 0
                const isToday = data.todayKey === dayKey
                const isFriday = (data.firstWeekday + dayNumber - 1) % 7 === 6
                const kinds = events ? dayKinds(events) : []
                const daySales = events
                  ? events.invoices.filter((x) => x.type === "SALE").reduce((a, x) => a + x.total, 0)
                  : 0

                const numberBadge = cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                  isToday ? "bg-primary text-primary-foreground" : isFriday ? "text-destructive/70" : "text-foreground/80"
                )
                const indicators = (
                  <span className="flex min-h-[1.1rem] flex-wrap items-center justify-center gap-0.5">
                    {kinds.map((k) => (
                      <span
                        key={k.dot}
                        className="flex items-center gap-px rounded-full bg-foreground/[0.07] px-1 py-px"
                      >
                        <span className={cn("size-1.5 rounded-full", k.dot)} aria-hidden="true" />
                        {k.count > 1 && (
                          <span className="nums text-[0.55rem] font-bold leading-none text-muted-foreground">
                            {toPersianDigits(k.count)}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                )

                // روز بدون رویداد — غیرتعاملی
                if (!events || totalCount === 0) {
                  return (
                    <motion.div
                      key={dayKey}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.5) }}
                      className="flex min-h-[3.4rem] flex-col items-center justify-between gap-1 rounded-2xl border border-transparent p-1.5 lg:min-h-24"
                    >
                      <span className={numberBadge}>{toPersianDigits(dayNumber)}</span>
                      {indicators}
                    </motion.div>
                  )
                }

                // روز دارای رویداد — قابل لمس
                return (
                  <motion.button
                    key={dayKey}
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.5) }}
                    onClick={() => setSelectedDay(dayKey)}
                    aria-label={`${toPersianDigits(dayNumber)} ${monthKeyLabel(data.month)} — ${toPersianDigits(totalCount)} رویداد`}
                    whileTap={{ scale: 0.92 }}
                    style={{
                      background: `color-mix(in srgb, var(--sale) ${Math.round(4 + (maxDaySales ? (daySales / maxDaySales) * 16 : 0))}%, var(--card))`,
                    }}
                    className={cn(
                      "flex min-h-[3.4rem] flex-col items-center justify-between gap-1 rounded-2xl border p-1.5 transition-shadow hover:shadow-card-hover lg:min-h-24",
                      isToday ? "border-primary/40 ring-2 ring-primary" : "border-[color:color-mix(in_srgb,var(--sale)_18%,transparent)]"
                    )}
                  >
                    <span className={numberBadge}>{toPersianDigits(dayNumber)}</span>
                    {daySales > 0 && (
                      <span className="nums hidden text-[0.62rem] font-bold text-[color:color-mix(in_srgb,var(--sale)_80%,black)] lg:block">
                        {formatTomanCompact(daySales).replace(" تومان", "")}
                      </span>
                    )}
                    {indicators}
                  </motion.button>
                )
              })}
            </motion.div>
            </AnimatePresence>

            {/* راهنمای رنگ‌ها */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-dashed pt-3">
              {LEGEND.map((l) => (
                <span
                  key={l.label}
                  className="flex items-center gap-1 text-[0.65rem] font-medium text-muted-foreground"
                >
                  <span className={cn("size-2 rounded-full", l.dot)} aria-hidden="true" />
                  {l.label}
                </span>
              ))}
            </div>
          </section>

          {summary?.totalEvents === 0 && (
            <p className="text-center text-xs text-muted-foreground">در این ماه رویداد مالی ثبت نشده است</p>
          )}
        </div>
      )}

      {/* شیت جزئیات روز */}
      <BottomSheet
        open={!!selectedEvents && selectedCount > 0}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatJalaliWithWeekday(dayKeyToDate(selectedDay)) : ""}
        description={selectedEvents ? `${toPersianDigits(selectedCount)} رویداد مالی` : ""}
      >
        {selectedEvents && (
          <div className="space-y-4">
            {/* چک‌ها */}
            {selectedEvents.checks.length > 0 && (
              <section aria-label="چک‌های سررسید">
                <SheetSectionTitle dot="bg-destructive" label="چک‌های سررسید" count={selectedEvents.checks.length} />
                <div className="space-y-2">
                  {selectedEvents.checks.map((c) => (
                    <div
                      key={c.id}
                      className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3", checkRowBorder(c.status))}
                    >
                      <BankLogo bankKey={c.bankKey} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-bold">{c.person.name}</span>
                          <CheckDirectionBadge direction={c.direction} size="sm" />
                        </div>
                        <p className="nums mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                          {getBank(c.bankKey).name} • سریال {toPersianDigits(c.serial)}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className={cn("nums text-sm font-extrabold", c.status !== "PENDING" && "text-muted-foreground")}>
                          {formatToman(c.amount, false)}
                        </p>
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded-lg px-1.5 py-px text-[0.6rem] font-bold",
                            CHECK_STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          {CHECK_STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* فاکتورها */}
            {selectedEvents.invoices.length > 0 && (
              <section aria-label="فاکتورها">
                <SheetSectionTitle dot="bg-primary" label="فاکتورها" count={selectedEvents.invoices.length} />
                <div className="space-y-2">
                  {selectedEvents.invoices.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => {
                        setSelectedDay(null)
                        router.push(`/invoices/${inv.id}`)
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-start transition-all hover:bg-accent/60 active:scale-[0.99]"
                    >
                      <InvoiceTypeMark type={inv.type} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          فاکتور {inv.type === "PURCHASE" ? "خرید" : "فروش"}
                          <span className="nums"> #{toPersianDigits(inv.number)}</span>
                        </p>
                        <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{inv.person.name}</p>
                      </div>
                      <p className="nums shrink-0 text-sm font-extrabold">{formatToman(inv.total, false)}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* تسویه‌ها */}
            {selectedEvents.settlements.length > 0 && (
              <section aria-label="تسویه‌ها">
                <SheetSectionTitle dot="bg-income" label="تسویه‌ها" count={selectedEvents.settlements.length} />
                <div className="space-y-2">
                  {selectedEvents.settlements.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-2xl border border-income/25 bg-income/[0.04] p-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-income/10 text-income">
                        <HandCoins className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{s.person.name}</p>
                        <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                          {s.direction === "RECEIVE" ? "دریافت" : "پرداخت"} {s.method === "CASH" ? "نقدی" : "چکی"}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "nums shrink-0 text-sm font-extrabold",
                          s.direction === "RECEIVE" ? "text-income" : "text-destructive"
                        )}
                      >
                        {formatToman(s.amount, false)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </BottomSheet>
      <MonthPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} month={month} onPick={jumpTo} />
    </div>
  )
}
