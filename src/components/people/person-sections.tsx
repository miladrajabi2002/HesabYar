"use client"

/**
 * بخش‌های پروفایل شخص — خلاصه و گزارش، دفتر حساب (گردش با ماندهٔ جاری)، فاکتورها، چک‌ها، کالاها
 * داده‌ها از GET /api/people/[id] می‌آیند؛ این فایل فقط نمایش و فیلتر سمت کاربر است.
 */
import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  Clock,
  FileDown,
  FileText,
  HandCoins,
  Package,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import {
  JALALI_MONTHS,
  diffJalaliDays,
  formatJalali,
  formatJalaliShort,
  jalaliMonthKey,
  monthKeyLabel,
  nowTehran,
} from "@/lib/jalali"
import { dueLabel, formatOpenDays } from "@/lib/format"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"
import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"

/* ───────────── انواع داده ───────────── */

export interface PersonInvoice {
  id: string
  number: number
  type: string
  date: string
  subtotal: number
  discount: number
  total: number
  paidCash: number
  paidChecks: number
  credit: number
  status: string
  note: string | null
  itemCount: number
}

export interface PersonCheck {
  id: string
  serial: string
  amount: number
  bankKey: string
  dueDate: string
  status: string
  direction: string
  isRegistered: boolean
  note: string | null
  invoice: { id: string; number: number; type: string } | null
  account: { id: string; name: string; bankKey: string } | null
}

export interface PersonSettlement {
  id: string
  direction: string
  method: string
  amount: number
  date: string
  note: string | null
}

export interface LedgerRow {
  date: string
  title: string
  detail?: string
  debit: number
  credit: number
  balance: number
  kind: "opening" | "invoice" | "payment" | "settlement" | "carry"
  ref?: { type: "invoice" | "settlement"; id: string }
  account: string | null
}

type CountSum = { count: number; sum: number }

export interface PersonStats {
  salesTotal: number
  salesCount: number
  purchaseTotal: number
  purchaseCount: number
  saleDiscounts: number
  profit: number
  receivedTotal: number
  paidTotal: number
  saleOpen: CountSum
  purchaseOpen: CountSum
  avgSale: number
  avgPurchase: number
  firstDeal: string | null
  lastDeal: string | null
  lastSale: string | null
  lastPurchase: string | null
  checks: {
    pendingReceived: CountSum
    pendingIssued: CountSum
    overdue: CountSum
    cashed: CountSum
    bounced: CountSum
    reliability: number | null
    nextDue: { id: string; amount: number; dueDate: string; direction: string } | null
  }
}

export interface MonthPoint {
  key: string
  sales: number
  purchases: number
  received: number
  paid: number
}

export interface ProductRow {
  productId: string
  name: string
  unit: string
  quantity: number
  total: number
  lines: number
  lastPrice: number
  lastDate: string
  profit: number
}

/* ───────────── اجزای مشترک ───────────── */

function Card({ title, icon, action, children, className }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
            {icon}
            <span className="truncate">{title}</span>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>
}

function qty(n: number): string {
  return toPersianDigits(Number.isInteger(n) ? n : +n.toFixed(2))
}

function daysAgo(iso: string | null): string | null {
  if (!iso) return null
  const d = diffJalaliDays(new Date(iso), nowTehran())
  if (d <= 0) return "امروز"
  if (d === 1) return "دیروز"
  return `${formatOpenDays(d)} پیش`
}

/* ───────────── خلاصه و گزارش ───────────── */

export function PersonOverview({
  stats,
  monthly,
  invoices,
  checks,
  onOpenTab,
  children,
}: {
  stats: PersonStats
  monthly: MonthPoint[]
  invoices: PersonInvoice[]
  checks: PersonCheck[]
  onOpenTab: (tab: "ledger" | "invoices" | "checks" | "products") => void
  children?: ReactNode
}) {
  const c = stats.checks
  const openInvoices = invoices.filter((i) => i.credit > 0).slice(0, 5)
  const now = nowTehran()

  // نکته‌های هوشمند — آن‌چه همین حالا باید دید
  const insights: { icon: ReactNode; text: string; tone: "danger" | "warn" | "ok" | "info"; onClick?: () => void }[] = []
  if (c.overdue.count > 0)
    insights.push({
      icon: <AlertTriangle className="size-4" />,
      text: `${toPersianDigits(c.overdue.count)} چک سررسیدگذشته • ${formatToman(c.overdue.sum, false)} تومان`,
      tone: "danger",
      onClick: () => onOpenTab("checks"),
    })
  if (c.bounced.count > 0)
    insights.push({
      icon: <AlertTriangle className="size-4" />,
      text: `${toPersianDigits(c.bounced.count)} چک برگشتی در سابقه`,
      tone: "danger",
      onClick: () => onOpenTab("checks"),
    })
  if (stats.saleOpen.count > 0)
    insights.push({
      icon: <FileText className="size-4" />,
      text: `${toPersianDigits(stats.saleOpen.count)} فاکتور فروش هنوز مانده دارد`,
      tone: "warn",
      onClick: () => onOpenTab("invoices"),
    })
  if (c.nextDue)
    insights.push({
      icon: <CalendarClock className="size-4" />,
      text: `چک بعدی: ${formatToman(c.nextDue.amount, false)} • ${dueLabel(new Date(c.nextDue.dueDate), now)}`,
      tone: "info",
      onClick: () => onOpenTab("checks"),
    })
  if (c.reliability !== null)
    insights.push({
      icon: <ShieldCheck className="size-4" />,
      text: `خوش‌حسابی چک: ${toPersianDigits(c.reliability)}٪ پاس شده`,
      tone: c.reliability >= 90 ? "ok" : c.reliability >= 70 ? "warn" : "danger",
    })
  if (stats.lastSale) {
    const d = diffJalaliDays(new Date(stats.lastSale), now)
    if (d >= 45)
      insights.push({
        icon: <Clock className="size-4" />,
        text: `${formatOpenDays(d)} است از شما خرید نکرده`,
        tone: "info",
        onClick: () => onOpenTab("invoices"),
      })
  }

  const kpis: { label: string; value: string; sub?: string; tone?: string }[] = [
    {
      label: "فروش به او",
      value: formatTomanCompact(stats.salesTotal),
      sub: `${toPersianDigits(stats.salesCount)} فاکتور`,
      tone: "var(--sale)",
    },
    {
      label: "خرید از او",
      value: formatTomanCompact(stats.purchaseTotal),
      sub: `${toPersianDigits(stats.purchaseCount)} فاکتور`,
      tone: "var(--purchase)",
    },
    { label: "دریافتی از او", value: formatTomanCompact(stats.receivedTotal), sub: "نقد، چک و تسویه", tone: "var(--income)" },
    { label: "پرداختی به او", value: formatTomanCompact(stats.paidTotal), sub: "نقد، چک و تسویه", tone: "var(--purchase)" },
  ]
  if (stats.salesCount > 0) {
    kpis.push({
      label: "سود از فروش به او",
      value: formatTomanCompact(stats.profit),
      sub: stats.salesTotal > 0 ? `حاشیه ${toPersianDigits(Math.round((stats.profit / stats.salesTotal) * 100))}٪` : undefined,
      tone: "var(--warning-ink)",
    })
    kpis.push({ label: "میانگین هر فروش", value: formatTomanCompact(stats.avgSale) })
  }
  if (stats.purchaseCount > 0) kpis.push({ label: "میانگین هر خرید", value: formatTomanCompact(stats.avgPurchase) })
  if (stats.saleDiscounts > 0) kpis.push({ label: "تخفیف داده‌شده", value: formatTomanCompact(stats.saleDiscounts) })

  const hasDeals = stats.salesCount + stats.purchaseCount > 0 || !!stats.lastDeal

  return (
    <div className="space-y-4">
      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.map((n, i) => {
            const cls = cn(
              "flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-start text-xs font-bold",
              n.tone === "danger" && "bg-destructive/8 text-destructive",
              n.tone === "warn" && "bg-warning/12 text-warning-ink",
              n.tone === "ok" && "bg-income/10 text-income",
              n.tone === "info" && "bg-primary/6 text-primary"
            )
            return n.onClick ? (
              <button key={i} type="button" onClick={n.onClick} className={cn(cls, "transition-opacity active:opacity-70")}>
                {n.icon}
                <span className="nums flex-1">{n.text}</span>
                <ChevronLeft className="size-4 opacity-50" />
              </button>
            ) : (
              <div key={i} className={cls}>
                {n.icon}
                <span className="nums flex-1">{n.text}</span>
              </div>
            )
          })}
        </div>
      )}

      <Card title="خلاصهٔ مالی" icon={<Wallet className="size-4 text-primary" />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-muted/50 px-3 py-2.5">
              <div className="truncate text-caption text-muted-foreground">{k.label}</div>
              <div
                className="nums mt-0.5 truncate text-sm font-extrabold"
                style={k.tone ? { color: `color-mix(in srgb, ${k.tone} 88%, black)` } : undefined}
              >
                {k.value}
              </div>
              {k.sub && <div className="nums truncate text-caption text-muted-foreground">{k.sub}</div>}
            </div>
          ))}
        </div>
        {hasDeals && (
          <div className="nums mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-dashed pt-3 text-caption sm:grid-cols-4">
            {[
              { l: "اولین معامله", v: stats.firstDeal ? formatJalali(new Date(stats.firstDeal)) : "—" },
              { l: "آخرین معامله", v: daysAgo(stats.lastDeal) ?? "—" },
              { l: "آخرین فروش", v: daysAgo(stats.lastSale) ?? "—" },
              { l: "آخرین خرید", v: daysAgo(stats.lastPurchase) ?? "—" },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between gap-2 sm:block">
                <span className="text-muted-foreground">{r.l}</span>
                <span className="font-bold sm:block">{r.v}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {monthly.some((m) => m.sales || m.purchases || m.received || m.paid) && <MonthlyChart monthly={monthly} />}

      {(c.pendingReceived.count + c.pendingIssued.count + c.cashed.count + c.bounced.count > 0 || checks.length > 0) && (
        <Card
          title="وضعیت چک‌ها"
          icon={<Sparkles className="size-4 text-[color:var(--hue-checks)]" />}
          action={
            <button type="button" onClick={() => onOpenTab("checks")} className="text-caption font-bold text-primary">
              همهٔ چک‌ها
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: "دریافتی در جریان", v: c.pendingReceived, cls: "text-income" },
              { l: "صادره در جریان", v: c.pendingIssued, cls: "text-purchase" },
              { l: "پاس شده", v: c.cashed, cls: "text-foreground" },
              { l: "برگشتی", v: c.bounced, cls: c.bounced.count ? "text-destructive" : "text-muted-foreground" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-muted/50 px-3 py-2.5">
                <div className="truncate text-caption text-muted-foreground">{s.l}</div>
                <div className={cn("nums mt-0.5 truncate text-sm font-extrabold", s.cls)}>{formatTomanCompact(s.v.sum)}</div>
                <div className="nums text-caption text-muted-foreground">{toPersianDigits(s.v.count)} فقره</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {openInvoices.length > 0 && (
        <Card
          title="فاکتورهای باز"
          icon={<FileText className="size-4 text-warning-ink" />}
          action={
            <button type="button" onClick={() => onOpenTab("invoices")} className="text-caption font-bold text-primary">
              همه
            </button>
          }
        >
          <div className="divide-y divide-border/60">
            {openInvoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </div>
        </Card>
      )}

      {children}
    </div>
  )
}

/** گردش ۱۲ ماه — ستون‌های جفت با لمس برای جزئیات ماه */
function MonthlyChart({ monthly }: { monthly: MonthPoint[] }) {
  const [mode, setMode] = useState<"trade" | "cash">("trade")
  const [sel, setSel] = useState(monthly.length - 1)
  const a = mode === "trade" ? "sales" : "received"
  const b = mode === "trade" ? "purchases" : "paid"
  const labels =
    mode === "trade"
      ? { a: "فروش", b: "خرید", ca: "var(--sale)", cb: "var(--purchase)" }
      : { a: "دریافت", b: "پرداخت", ca: "var(--income)", cb: "var(--warning)" }
  const max = Math.max(1, ...monthly.map((m) => Math.max(m[a], m[b])))
  const cur = monthly[sel]

  return (
    <Card title="گردش ۱۲ ماه اخیر" icon={<CalendarClock className="size-4 text-primary" />}>
      <Segmented
        size="sm"
        value={mode}
        onChange={setMode}
        className="mb-2.5"
        options={[
          { key: "trade", label: "خرید و فروش" },
          { key: "cash", label: "دریافت و پرداخت" },
        ]}
      />
      <div className="nums mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-3 py-2 text-caption">
        <span className="font-extrabold">{monthKeyLabel(cur.key)}</span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: labels.ca }} />
          {labels.a} {formatToman(cur[a], false)}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: labels.cb }} />
          {labels.b} {formatToman(cur[b], false)}
        </span>
      </div>
      <div className="flex h-32 items-end gap-1" role="list">
        {monthly.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="listitem"
            onClick={() => setSel(i)}
            aria-label={monthKeyLabel(m.key)}
            className={cn(
              "flex h-full flex-1 items-end justify-center gap-px rounded-md pb-0.5 transition-colors",
              i === sel ? "bg-primary/8" : "hover:bg-muted/60"
            )}
          >
            {[m[a], m[b]].map((v, j) => (
              <span
                key={j}
                className="w-[38%] max-w-2.5 rounded-t-[3px] transition-[height] duration-300"
                style={{
                  height: v ? `${Math.max(4, (v / max) * 100)}%` : "2px",
                  background: v ? (j === 0 ? labels.ca : labels.cb) : "var(--border)",
                }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] leading-tight text-muted-foreground">
        {monthly.map((m, i) => {
          const jm = Number(m.key.slice(5))
          return (
            <span key={m.key} title={JALALI_MONTHS[jm - 1]} className={cn("nums flex-1 truncate", i === sel && "font-bold text-primary")}>
              {toPersianDigits(jm)}
            </span>
          )
        })}
      </div>
    </Card>
  )
}

/* ───────────── دفتر حساب (گردش) ───────────── */

export function PersonLedger({
  ledger,
  onOpenSettlement,
  onStatement,
}: {
  ledger: LedgerRow[]
  onOpenSettlement: (id: string) => void
  onStatement: () => void
}) {
  const [filter, setFilter] = useState<"all" | "invoice" | "in" | "out">("all")
  const rows = useMemo(
    () =>
      ledger.filter((r) => {
        if (filter === "all") return true
        if (filter === "invoice") return r.kind === "invoice" || r.kind === "opening"
        const money = r.kind === "payment" || r.kind === "settlement"
        return money && (filter === "in" ? r.credit > 0 : r.debit > 0)
      }),
    [ledger, filter]
  )
  const groups = useMemo(() => {
    const out: { key: string; rows: LedgerRow[] }[] = []
    for (const r of rows) {
      const k = jalaliMonthKey(new Date(r.date))
      const last = out[out.length - 1]
      if (last && last.key === k) last.rows.push(r)
      else out.push({ key: k, rows: [r] })
    }
    return out
  }, [rows])
  const tIn = rows.reduce((s, r) => s + r.credit, 0)
  const tOut = rows.reduce((s, r) => s + r.debit, 0)

  return (
    <Card
      title="دفتر حساب"
      icon={<HandCoins className="size-4 text-primary" />}
      action={
        <button type="button" onClick={onStatement} className="flex items-center gap-1 text-caption font-bold text-primary">
          <FileDown className="size-3.5" />
          PDF
        </button>
      }
    >
      <Segmented
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "همه" },
          { key: "invoice", label: "فاکتورها" },
          { key: "in", label: "دریافت‌ها" },
          { key: "out", label: "پرداخت‌ها" },
        ]}
      />
      {rows.length > 0 && (
        <div className="nums mt-2.5 grid grid-cols-2 gap-2 text-caption">
          <div className="rounded-xl bg-warning/10 px-3 py-2">
            <div className="text-muted-foreground">بدهکار • فروش و پرداخت ما</div>
            <div className="font-extrabold text-warning-ink">{formatToman(tOut, false)}</div>
          </div>
          <div className="rounded-xl bg-income/8 px-3 py-2">
            <div className="text-muted-foreground">بستانکار • خرید و دریافت ما</div>
            <div className="font-extrabold text-income">{formatToman(tIn, false)}</div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>در این دسته گردشی ثبت نشده</Empty>
        </div>
      ) : (
        <div className="mt-2">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="pb-1 pt-3 text-caption font-extrabold text-muted-foreground">
                {monthKeyLabel(g.key)}
              </div>
              <div className="divide-y divide-border/60">
                {g.rows.map((r, i) => (
                  <LedgerItem key={`${g.key}-${i}`} r={r} onOpenSettlement={onOpenSettlement} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function LedgerItem({ r, onOpenSettlement }: { r: LedgerRow; onOpenSettlement: (id: string) => void }) {
  const isDebit = r.debit > 0
  const amount = isDebit ? r.debit : r.credit
  const icon =
    r.kind === "invoice" ? (
      <FileText className="size-4" />
    ) : r.kind === "opening" ? (
      <Wallet className="size-4" />
    ) : isDebit ? (
      <ArrowUpRight className="size-4" />
    ) : (
      <ArrowDownLeft className="size-4" />
    )
  const detail = [r.detail, r.account].filter(Boolean).join(" • ")
  const body = (
    <>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl",
          isDebit ? "bg-warning/12 text-warning-ink" : "bg-income/10 text-income"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="nums truncate text-xs font-bold">{toPersianDigits(r.title)}</div>
        <div className="nums truncate text-caption text-muted-foreground">
          {formatJalaliShort(new Date(r.date))}
          {detail && ` • ${toPersianDigits(detail)}`}
        </div>
      </div>
      <div className="shrink-0 text-end">
        <div className={cn("nums text-xs font-extrabold", isDebit ? "text-warning-ink" : "text-income")}>
          {amount ? formatToman(amount, false) : "—"}
        </div>
        <div className="nums text-caption text-muted-foreground">
          مانده {r.balance === 0 ? "صفر" : `${formatTomanCompact(Math.abs(r.balance))} ${r.balance > 0 ? "بد" : "بس"}`}
        </div>
      </div>
    </>
  )
  const cls = "-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-xl px-1 py-2.5 text-start transition-colors hover:bg-accent/50"
  if (r.ref?.type === "invoice")
    return (
      <Link href={`/invoices/${r.ref.id}`} className={cls}>
        {body}
      </Link>
    )
  if (r.ref?.type === "settlement") {
    const sid = r.ref.id
    return (
      <button type="button" onClick={() => onOpenSettlement(sid)} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

/* ───────────── فاکتورها ───────────── */

function InvoiceRow({ inv }: { inv: PersonInvoice }) {
  const days = inv.credit > 0 ? diffJalaliDays(new Date(inv.date), nowTehran()) : 0
  return (
    <Link
      href={`/invoices/${inv.id}`}
      className="-mx-1 flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-accent/50"
    >
      <InvoiceTypeMark type={inv.type} size={38} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">
          {inv.type === "SALE" ? "فروش" : "خرید"} #{toPersianDigits(inv.number)}
        </div>
        <div className="nums truncate text-caption text-muted-foreground">
          {formatJalaliShort(new Date(inv.date))} • {toPersianDigits(inv.itemCount)} قلم
          {inv.discount > 0 && ` • تخفیف ${formatTomanCompact(inv.discount)}`}
        </div>
      </div>
      <div className="shrink-0 text-end">
        <div className="nums text-sm font-extrabold">{formatToman(inv.total, false)}</div>
        {inv.credit > 0 ? (
          <div className="nums text-caption font-bold text-warning-ink">
            مانده {formatTomanCompact(inv.credit)}
            {days > 0 && <span className="font-medium opacity-75"> • {formatOpenDays(days)}</span>}
          </div>
        ) : (
          <div className="text-caption font-bold text-income">تسویه ✓</div>
        )}
      </div>
    </Link>
  )
}

export function PersonInvoices({ invoices }: { invoices: PersonInvoice[] }) {
  const [filter, setFilter] = useState<"all" | "SALE" | "PURCHASE" | "open">("all")
  const list = invoices.filter((i) =>
    filter === "all" ? true : filter === "open" ? i.credit > 0 : i.type === filter
  )
  const total = list.reduce((s, i) => s + i.total, 0)
  const credit = list.reduce((s, i) => s + i.credit, 0)
  return (
    <Card title="فاکتورها" icon={<FileText className="size-4 text-primary" />}>
      <Segmented
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "همه", count: invoices.length },
          { key: "SALE", label: "فروش", tone: "var(--sale)" },
          { key: "PURCHASE", label: "خرید", tone: "var(--purchase)" },
          { key: "open", label: "باز", count: invoices.filter((i) => i.credit > 0).length, tone: "var(--warning-ink)" },
        ]}
      />
      {list.length > 0 && (
        <div className="nums mt-2.5 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-caption">
          <span className="text-muted-foreground">
            {toPersianDigits(list.length)} فاکتور • جمع <b className="text-foreground">{formatToman(total, false)}</b>
          </span>
          {credit > 0 && <span className="font-bold text-warning-ink">مانده {formatTomanCompact(credit)}</span>}
        </div>
      )}
      <div className="mt-1 divide-y divide-border/60">
        {list.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} />
        ))}
      </div>
      {list.length === 0 && (
        <div className="mt-3">
          <Empty>فاکتوری در این دسته نیست</Empty>
        </div>
      )}
    </Card>
  )
}

/* ───────────── چک‌ها ───────────── */

const STATUS_LABEL: Record<string, { t: string; cls: string }> = {
  CASHED: { t: "پاس ✓", cls: "bg-income/10 text-income" },
  PENDING: { t: "در جریان", cls: "bg-warning/15 text-warning-ink" },
  BOUNCED: { t: "برگشتی", cls: "bg-destructive/10 text-destructive" },
  CANCELED: { t: "لغو", cls: "bg-muted text-muted-foreground" },
}

export function PersonChecks({ checks }: { checks: PersonCheck[] }) {
  const [filter, setFilter] = useState<"PENDING" | "CASHED" | "BOUNCED" | "all">(
    checks.some((c) => c.status === "PENDING") ? "PENDING" : "all"
  )
  const now = nowTehran()
  const list = checks
    .filter((c) => filter === "all" || c.status === filter)
    // در جریان: نزدیک‌ترین سررسید بالا؛ بقیه: جدیدترین بالا
    .sort((a, b) =>
      filter === "PENDING"
        ? new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        : new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
    )
  const count = (s: string) => checks.filter((c) => c.status === s).length
  const recv = list.filter((c) => c.direction === "RECEIVED").reduce((s, c) => s + c.amount, 0)
  const iss = list.filter((c) => c.direction === "ISSUED").reduce((s, c) => s + c.amount, 0)

  return (
    <Card title="چک‌ها" icon={<Sparkles className="size-4 text-[color:var(--hue-checks)]" />}>
      <Segmented
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "PENDING", label: "در جریان", count: count("PENDING"), tone: "var(--hue-checks)" },
          { key: "CASHED", label: "پاس", tone: "var(--income)" },
          { key: "BOUNCED", label: "برگشتی", count: count("BOUNCED"), tone: "var(--destructive)" },
          { key: "all", label: "همه" },
        ]}
      />
      {list.length > 0 && (
        <div className="nums mt-2.5 grid grid-cols-2 gap-2 text-caption">
          <div className="rounded-xl bg-muted/50 px-3 py-2">
            <div className="text-muted-foreground">دریافتی</div>
            <div className="font-extrabold text-income">{formatToman(recv, false)}</div>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-2">
            <div className="text-muted-foreground">صادره</div>
            <div className="font-extrabold text-purchase">{formatToman(iss, false)}</div>
          </div>
        </div>
      )}
      <div className="mt-1 divide-y divide-border/60">
        {list.map((c) => {
          const due = new Date(c.dueDate)
          const late = c.status === "PENDING" && diffJalaliDays(now, due) < 0
          const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.CANCELED
          return (
            <Link
              key={c.id}
              href={`/checks?open=${c.id}`}
              className="-mx-1 flex items-center gap-2.5 rounded-xl px-1 py-2.5 transition-colors hover:bg-accent/50"
            >
              <BankLogo bankKey={c.bankKey} size={34} />
              <div className="min-w-0 flex-1">
                <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                <div className="nums truncate text-caption text-muted-foreground">
                  {getBank(c.bankKey).name}
                  {c.serial && ` • ${toPersianDigits(c.serial)}`}
                  {c.invoice && ` • فاکتور ${toPersianDigits(c.invoice.number)}`}
                </div>
                <div className={cn("nums text-caption", late ? "font-bold text-destructive" : "text-muted-foreground")}>
                  سررسید {formatJalaliShort(due)}
                  {c.status === "PENDING" && ` (${dueLabel(due, now)})`}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <CheckDirectionBadge direction={c.direction} size="sm" />
                <span className={cn("rounded-md px-1.5 py-px text-caption font-bold", st.cls)}>{st.t}</span>
              </div>
            </Link>
          )
        })}
      </div>
      {list.length === 0 && (
        <div className="mt-3">
          <Empty>چکی در این دسته نیست</Empty>
        </div>
      )}
    </Card>
  )
}

/* ───────────── کالاها ───────────── */

export function PersonProducts({ products }: { products: { sold: ProductRow[]; bought: ProductRow[] } }) {
  const [side, setSide] = useState<"sold" | "bought">(products.sold.length || !products.bought.length ? "sold" : "bought")
  const list = products[side]
  const total = list.reduce((s, r) => s + r.total, 0)
  return (
    <Card title="کالاها" icon={<Package className="size-4 text-primary" />}>
      <Segmented
        size="sm"
        value={side}
        onChange={setSide}
        options={[
          { key: "sold", label: "از ما خریده", count: products.sold.length, tone: "var(--sale)" },
          { key: "bought", label: "به ما فروخته", count: products.bought.length, tone: "var(--purchase)" },
        ]}
      />
      {list.length === 0 ? (
        <div className="mt-3">
          <Empty>{side === "sold" ? "هنوز کالایی به او نفروخته‌اید" : "هنوز کالایی از او نخریده‌اید"}</Empty>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {list.map((r) => {
            const share = total ? (r.total / total) * 100 : 0
            return (
              <div key={r.productId} className="relative overflow-hidden rounded-2xl bg-muted/40 px-3 py-2.5">
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 opacity-[0.10]"
                  style={{ width: `${share}%`, background: side === "sold" ? "var(--sale)" : "var(--purchase)" }}
                />
                <div className="relative flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold">{r.name}</div>
                    <div className="nums truncate text-caption text-muted-foreground">
                      {qty(r.quantity)} {r.unit} • {toPersianDigits(r.lines)} بار • {daysAgo(r.lastDate)}
                    </div>
                    {side === "sold" && r.profit !== 0 && (
                      <div className="nums truncate text-caption font-bold text-warning-ink">سود {formatTomanCompact(r.profit)}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="nums text-xs font-extrabold">{formatTomanCompact(r.total)}</div>
                    <div className="nums text-caption text-muted-foreground">فی {formatToman(r.lastPrice, false)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
