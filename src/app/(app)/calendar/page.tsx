"use client"

/**
 * تقویم مالی (ADV-05) — نمای ماهانه شمسی از رویدادهای مالی فروشگاه
 * چک‌های سررسید، فاکتورهای فروش/خرید و تسویه‌ها روی روزهای ماه.
 * API: GET /api/calendar?month=1404-08
 */
import { useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  ReceiptText,
  ShoppingCart,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import {
  WEEKDAYS,
  currentMonthKey,
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
import { cn } from "@/lib/utils"

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

const LEGEND = [
  { dot: "bg-primary", label: "فاکتور فروش" },
  { dot: "bg-warning", label: "فاکتور خرید" },
  { dot: "bg-destructive", label: "سررسید چک" },
  { dot: "bg-income", label: "تسویه" },
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
  if (events.checks.length > 0) kinds.push({ dot: "bg-destructive", count: events.checks.length })
  if (sales > 0) kinds.push({ dot: "bg-primary", count: sales })
  if (purchases > 0) kinds.push({ dot: "bg-warning", count: purchases })
  if (events.settlements.length > 0) kinds.push({ dot: "bg-income", count: events.settlements.length })
  return kinds.slice(0, 3)
}

// ───────────────────────── اجزای کوچک ─────────────────────────

function SummaryChip({
  icon,
  label,
  value,
  sub,
  classes,
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
  classes: string
}) {
  return (
    <div className={cn("rounded-2xl border p-3.5", classes)}>
      <div className="flex items-center gap-1.5 text-[0.7rem] font-medium">
        {icon}
        {label}
      </div>
      <p className="nums mt-1 text-base font-extrabold sm:text-lg">{value}</p>
      <p className="nums mt-0.5 text-[0.65rem] opacity-70">{sub}</p>
    </div>
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

// ───────────────────────── صفحه ─────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  useTelegramBackButton()

  const [month, setMonth] = useState<string>(() => currentMonthKey())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

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
    let salesCount = 0
    let salesSum = 0
    let purchaseCount = 0
    let purchaseSum = 0
    let settleCount = 0
    let settleSum = 0
    for (const day of Object.values(data.days)) {
      for (const c of day.checks) {
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
      salesCount,
      salesSum,
      purchaseCount,
      purchaseSum,
      settleCount,
      settleSum,
      totalEvents: pendingChecks + salesCount + purchaseCount + settleCount,
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

  const goPrev = () => setMonth(previousMonthKey(month))
  const goNext = () => setMonth(nextMonthKey(month))
  const goToday = () => {
    const cur = currentMonthKey()
    if (month === cur) {
      toast.info("همین حالا در ماه جاری هستید")
      return
    }
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
        <h1 className="flex-1 truncate text-center text-lg font-extrabold sm:text-xl" aria-live="polite">
          {monthKeyLabel(month)}
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
                label="چک‌های در جریان"
                value={formatTomanCompact(summary.pendingChecksSum)}
                sub={`${toPersianDigits(summary.pendingChecks)} فقره سررسید`}
                classes="border-destructive/25 bg-destructive/[0.06] text-destructive"
              />
              <SummaryChip
                icon={<ReceiptText className="size-3.5" />}
                label="فروش این ماه"
                value={formatTomanCompact(summary.salesSum)}
                sub={`${toPersianDigits(summary.salesCount)} فاکتور فروش`}
                classes="border-primary/25 bg-primary/[0.06] text-primary"
              />
              <SummaryChip
                icon={<ShoppingCart className="size-3.5" />}
                label="خرید این ماه"
                value={formatTomanCompact(summary.purchaseSum)}
                sub={`${toPersianDigits(summary.purchaseCount)} فاکتور خرید`}
                classes="border-warning/30 bg-warning/[0.07] text-warning"
              />
              <SummaryChip
                icon={<HandCoins className="size-3.5" />}
                label="تسویه‌های این ماه"
                value={formatTomanCompact(summary.settleSum)}
                sub={`${toPersianDigits(summary.settleCount)} تسویه`}
                classes="border-income/25 bg-income/[0.06] text-income"
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
            <motion.div
              key={data.month}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
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
                    className={cn(
                      "flex min-h-[3.4rem] flex-col items-center justify-between gap-1 rounded-2xl border p-1.5 transition-colors lg:min-h-24",
                      isToday
                        ? "border-primary/40 bg-primary/[0.06] ring-2 ring-primary"
                        : "border-primary/20 bg-primary/[0.05]",
                      "hover:bg-primary/10 active:bg-primary/15"
                    )}
                  >
                    <span className={numberBadge}>{toPersianDigits(dayNumber)}</span>
                    {indicators}
                  </motion.button>
                )
              })}
            </motion.div>

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
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                              c.direction === "RECEIVED"
                                ? "bg-primary/10 text-primary"
                                : "bg-destructive/10 text-destructive"
                            )}
                          >
                            {c.direction === "RECEIVED" ? "دریافتی" : "صادره"}
                          </span>
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
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl",
                          inv.type === "PURCHASE" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
                        )}
                      >
                        {inv.type === "PURCHASE" ? <ShoppingCart className="size-5" /> : <ReceiptText className="size-5" />}
                      </span>
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
    </div>
  )
}
