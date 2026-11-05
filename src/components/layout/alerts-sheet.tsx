"use client"

/**
 * شیت زنگ «کار امروز» — اعلان‌های /api/alerts
 *  • هر اعلان کامل خوانده می‌شود: چه شده، از کی، چقدر، و برای چک ثبت‌نشده چه باید کرد
 *  • هر اعلان اقدام خودش را دارد: رسیدگی به چک (شیت پاس/برگشت در صفحهٔ چک‌ها)، ثبت دریافت نسیه
 *    (شیت تسویهٔ فاکتور)، ثبت خرید برای کالای رو به اتمام
 *  • بستن با دکمهٔ ✕ یا کشیدن ردیف (لمسی)، «بستن همه» برای کل فهرست — هر دو با فرصت بازگردانی
 *  • باز کردن شیت اعلان‌ها را «دیده‌شده» می‌کند تا عدد زنگ صفر شود؛ نقطهٔ «تازه» تا بستن شیت می‌ماند
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BadgeAlert, ChevronLeft, PackageMinus, ReceiptText, TriangleAlert, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiPost } from "@/lib/api-client"
import { formatJalaliShort } from "@/lib/jalali"
import { dueLabel } from "@/lib/format"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatUnit } from "@/lib/units"
import { getBank } from "@/lib/banks"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { BankLogo } from "@/components/ui/bank-logo"
import { SwipeRow } from "@/components/ui/swipe-row"
import { showUndoToast } from "@/components/ui/undo-toast"
import { IconBell } from "@/components/icons/app-icons"

type CheckAlert = {
  key: string
  kind: "check"
  unread: boolean
  id: string
  amount: number
  dueDate: string
  direction: string
  bankKey: string
  serial: string
  personName: string
  isRegistered: boolean
  daysLeft: number
}
type SaleAlert = {
  key: string
  kind: "sale"
  unread: boolean
  id: string
  number: number
  personName: string
  credit: number
  total: number
  date: string
  ageDays: number
}
type StockAlert = {
  key: string
  kind: "stock"
  unread: boolean
  id: string
  name: string
  unit: string
  stock: number
  minStock: number
}
export type AlertItem = CheckAlert | SaleAlert | StockAlert

export type AlertsData = {
  items: AlertItem[]
  unreadCount: number
  totalCount: number
  dismissedCount: number
}

const SECTIONS: { kind: AlertItem["kind"]; title: string }[] = [
  { kind: "check", title: "چک‌های سررسیدشده" },
  { kind: "sale", title: "نسیه‌های معوق" },
  { kind: "stock", title: "کالاهای رو به اتمام" },
]

const qty = (n: number) => toPersianDigits(Math.round(n * 100) / 100)

export function AlertsSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data?: AlertsData }) {
  const queryClient = useQueryClient()
  // اعلان‌هایی که با باز شدن همین شیت «دیده» شدند — نقطهٔ تازه تا بسته شدن شیت روی آن‌ها می‌ماند
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const items = data?.items ?? []

  const patchCache = (fn: (d: AlertsData) => AlertsData) =>
    queryClient.setQueryData<AlertsData>(["alerts"], (d) => (d ? fn(d) : d))

  const send = (action: "seen" | "dismiss" | "restore", keys: string[]) =>
    apiPost("/api/alerts", { action, keys })

  // نقطهٔ «تازه»: اعلان‌های دیده‌نشده هنگام باز بودن شیت جمع می‌شوند و با بستن شیت پاک می‌شوند
  // (تنظیم state هنگام رندر، طبق الگوی «تنظیم state با تغییر props» ری‌اکت)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setFresh(new Set())
  }
  const unreadKeys = open ? items.filter((i) => i.unread).map((i) => i.key) : []
  if (unreadKeys.some((k) => !fresh.has(k))) setFresh(new Set([...fresh, ...unreadKeys]))

  // با باز شدن شیت: اعلان‌های تازه «دیده‌شده» ثبت می‌شوند تا عدد زنگ صفر شود
  useEffect(() => {
    if (!open || !data) return
    const unread = data.items.filter((i) => i.unread).map((i) => i.key)
    if (!unread.length) return
    patchCache((d) => ({ ...d, unreadCount: 0, items: d.items.map((i) => ({ ...i, unread: false })) }))
    send("seen", unread).catch(() => null)
  }, [open, data])

  const dismiss = (targets: AlertItem[]) => {
    const keys = targets.map((t) => t.key)
    const drop = new Set(keys)
    patchCache((d) => {
      const left = d.items.filter((i) => !drop.has(i.key))
      return {
        ...d,
        items: left,
        totalCount: left.length,
        unreadCount: left.filter((i) => i.unread).length,
        dismissedCount: d.dismissedCount + keys.length,
      }
    })
    send("dismiss", keys)
      .then(() =>
        showUndoToast({
          message: keys.length === 1 ? "اعلان بسته شد" : `${toPersianDigits(keys.length)} اعلان بسته شد`,
          description: "تا وقتی وضعیتش عوض نشود دوباره نمی‌آید",
          duration: 5000,
          onUndo: async () => {
            await send("restore", keys).catch(() => toast.error("بازگردانی اعلان ناموفق بود"))
            queryClient.invalidateQueries({ queryKey: ["alerts"] })
          },
        })
      )
      .catch(() => {
        toast.error("بستن اعلان ناموفق بود")
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      })
  }

  const total = items.length
  const freshCount = items.filter((i) => fresh.has(i.key)).length

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="کار امروز"
      size={total > 3 ? "tall" : "auto"}
      description={
        total
          ? `${toPersianDigits(total)} مورد نیاز به پیگیری دارد${freshCount ? ` | ${toPersianDigits(freshCount)} تازه` : ""}`
          : "همه‌چیز مرتب است"
      }
    >
      {total === 0 ? (
        <div className="py-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-income/10 text-income">
            <IconBell className="size-6" />
          </span>
          <p className="mt-3 text-sm font-bold">کار عقب‌افتاده‌ای ندارید</p>
          <p className="mt-1 text-caption text-muted-foreground">
            چک سررسیدشده، نسیهٔ معوق یا کالای رو به اتمام نیست.
            {data?.dismissedCount ? ` ${toPersianDigits(data.dismissedCount)} اعلان را خودتان بسته‌اید.` : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {total > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => dismiss(items)}
                className="rounded-lg px-2 py-1 text-label font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                بستن همه
              </button>
            </div>
          )}
          {SECTIONS.map(({ kind, title }) => {
            const group = items.filter((i) => i.kind === kind)
            if (!group.length) return null
            return (
              <section key={kind}>
                <h3 className="mb-2 flex items-center gap-1.5 text-label font-extrabold text-foreground/80">
                  {title}
                  <span className="nums text-caption font-bold text-muted-foreground">{toPersianDigits(group.length)}</span>
                </h3>
                <div className="space-y-2">
                  {group.map((item) => (
                    <SwipeRow
                      key={item.key}
                      className="rounded-2xl"
                      trailing={[
                        {
                          key: "dismiss",
                          label: "بستن",
                          icon: X,
                          tone: "neutral",
                          removes: true,
                          onAction: () => dismiss([item]),
                        },
                      ]}
                    >
                      <AlertCard
                        item={item}
                        fresh={fresh.has(item.key)}
                        onNavigate={onClose}
                        onDismiss={() => dismiss([item])}
                      />
                    </SwipeRow>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}

/** متن، رنگ و اقدام هر اعلان */
function describe(item: AlertItem): {
  title: string
  lines: string[]
  amount?: number
  amountLabel?: string
  badge: { text: string; tone: "danger" | "warning" }
  note?: string
  action: { label: string; href: string }
  link?: { label: string; href: string }
} {
  if (item.kind === "check") {
    const received = item.direction === "RECEIVED"
    const who = received ? `چک دریافتی از ${item.personName}` : `چک صادره به ${item.personName}`
    const overdue = item.daysLeft < 0
    return {
      title: overdue
        ? `${toPersianDigits(-item.daysLeft)} روز از سررسید ${who} گذشته`
        : `${who} امروز سررسید است`,
      lines: [
        `${getBank(item.bankKey).name}${item.serial ? ` | سریال ${toPersianDigits(item.serial)}` : ""}`,
        `سررسید ${formatJalaliShort(new Date(item.dueDate))}`,
      ],
      amount: item.amount,
      badge: { text: dueLabel(new Date(item.dueDate)), tone: overdue ? "danger" : "warning" },
      note: item.isRegistered
        ? received
          ? "اگر وصول شده «پاس شد» و اگر برگشت خورده «برگشت» بزنید."
          : "موجودی حساب را برای پاس شدن چک بررسی کنید."
        : "این چک هنوز به نام ثبت نشده؛ اول ثبتش کنید تا بشود پاس یا برگشتش زد.",
      action: { label: item.isRegistered ? "رسیدگی به چک" : "ثبت و رسیدگی", href: `/checks?open=${item.id}` },
    }
  }
  if (item.kind === "sale") {
    return {
      title: `فاکتور ${toPersianDigits(item.number)} ${item.personName} تسویه نشده`,
      lines: [
        `فروش ${formatJalaliShort(new Date(item.date))} | ${toPersianDigits(item.ageDays)} روز پیش`,
        `جمع فاکتور ${formatToman(item.total)}`,
      ],
      amount: item.credit,
      amountLabel: "مانده",
      badge: { text: `${toPersianDigits(item.ageDays)} روز`, tone: "danger" },
      action: { label: "ثبت دریافت", href: `/invoices/${item.id}?settle=1` },
      link: { label: "فاکتور", href: `/invoices/${item.id}` },
    }
  }
  const unit = formatUnit(item.unit)
  return {
    title: `${item.name} رو به اتمام است`,
    lines: [`${qty(item.stock)} ${unit} مانده | حد هشدار ${qty(item.minStock)} ${unit}`],
    badge: { text: `${qty(item.stock)} ${unit}`, tone: "warning" },
    action: { label: "ثبت خرید", href: "/invoices/new?type=PURCHASE" },
    link: { label: "انبار", href: "/products" },
  }
}

const KIND_ICON: Record<Exclude<AlertItem["kind"], "check">, { icon: LucideIcon; className: string }> = {
  sale: { icon: TriangleAlert, className: "bg-destructive/10 text-destructive" },
  stock: { icon: PackageMinus, className: "bg-warning/12 text-warning-ink" },
}

function AlertCard({
  item,
  fresh,
  onNavigate,
  onDismiss,
}: {
  item: AlertItem
  fresh: boolean
  onNavigate: () => void
  onDismiss: () => void
}) {
  const d = describe(item)
  const KindIcon = item.kind === "check" ? null : KIND_ICON[item.kind]
  return (
    <article className={cn("relative rounded-2xl border border-border bg-card p-3", fresh && "border-primary/30 bg-primary/[0.03]")}>
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          {KindIcon ? (
            <span className={cn("grid size-10 place-items-center rounded-xl", KindIcon.className)}>
              <KindIcon.icon className="size-5" />
            </span>
          ) : (
            item.kind === "check" && <BankLogo bankKey={item.bankKey} size={40} />
          )}
          {fresh && (
            <span
              aria-label="تازه"
              className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card"
            />
          )}
        </span>

        <div className="min-w-0 flex-1 pe-6">
          <p className="text-sm font-bold leading-6">{d.title}</p>
          {d.lines.map((line) => (
            <p key={line} className="nums text-caption text-muted-foreground">
              {line}
            </p>
          ))}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="بستن این اعلان"
          title="بستن"
          className="absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2 ps-[3.25rem]">
        {d.amount !== undefined && (
          <span className="nums text-sm font-extrabold">
            {d.amountLabel && <span className="me-1 text-caption font-medium text-muted-foreground">{d.amountLabel}</span>}
            {formatToman(d.amount)}
          </span>
        )}
        <span
          className={cn(
            "nums ms-auto rounded-full px-2 py-0.5 text-caption font-bold",
            d.badge.tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-warning/12 text-warning-ink"
          )}
        >
          {d.badge.text}
        </span>
      </div>

      {d.note && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-caption leading-5",
            item.kind === "check" && !item.isRegistered ? "bg-warning/10 text-warning-ink" : "bg-muted/60 text-muted-foreground"
          )}
        >
          {item.kind === "check" && !item.isRegistered && <BadgeAlert className="mt-0.5 size-3.5 shrink-0" />}
          {d.note}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <Link
          href={d.action.href}
          onClick={onNavigate}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-label font-bold text-primary-foreground transition-colors hover:bg-primary/85"
        >
          {d.action.label}
          <ChevronLeft className="size-4" />
        </Link>
        {d.link && (
          <Link
            href={d.link.href}
            onClick={onNavigate}
            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border px-3 text-label font-bold text-foreground transition-colors hover:bg-muted"
          >
            {item.kind === "sale" && <ReceiptText className="size-4" />}
            {d.link.label}
          </Link>
        )}
      </div>
    </article>
  )
}
