"use client"

/**
 * لیست فاکتورها — فیلتر نوع/شخص، جستجوی سروری + صفحه‌بندی واقعی (IMP-01)
 * موبایل: گروه‌بندی روزانه با ردیف‌های خط‌دار • دسکتاپ: جدول پهن با ستون وضعیت (UI-09، نسخهٔ ۷)
 * بنر نسیهٔ معوق → چیپ «نسیهٔ معوق N» در ردیف فیلترها
 */
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { usePageSub } from "@/components/layout/page-header"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Plus,
  FileText,
  Search,
  Download,
  ChevronDown,
  Loader2,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react"
import { apiDelete, apiGet } from "@/lib/api-client"
import { invoiceProfit } from "@/lib/finance-math"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort, formatJalaliWithWeekday, jalaliDayKey, nowTehran } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ListSkeleton } from "@/components/ui/page-skeletons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useTelegram } from "@/hooks/use-telegram"
import { deferDelete } from "@/components/ui/undo-toast"
import { useUIStore } from "@/lib/ui-store"
import { SearchField } from "@/components/ui/search-field"
import { SwipeRow } from "@/components/ui/swipe-row"
import { InvoiceTypeMark, InvoiceTypePill } from "@/components/ui/type-mark"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Invoice {
  id: string
  number: number
  type: string
  date: string
  total: number
  discount?: number
  paidCash: number
  paidChecks: number
  credit: number
  status: string
  note: string | null
  person: { id: string; name: string }
  items: {
    id: string
    productName: string
    quantity: number
    unit: string
    unitPrice: number
    costPrice: number
    total: number
  }[]
  checks: { id: string; amount: number; status: string }[]
}


const PAGE_SIZE = 25

function InvoicesPageInner() {
  const searchParams = useSearchParams()
  const { haptic } = useTelegram()
  const router = useRouter()
  const queryClient = useQueryClient()
  const pendingDeletes = useUIStore((s) => s.pendingDeletes)
  const [type, setType] = useState<"ALL" | "SALE" | "PURCHASE">("ALL")
  const [personId, setPersonId] = useState<string | null>(searchParams.get("person"))
  const qParam = searchParams.get("q") ?? ""
  const [q, setQ] = useState(qParam)
  // «همه در صفحهٔ خودش» از جستجوی سراسری: ?q= تازه فیلد را پر می‌کند
  const [lastQParam, setLastQParam] = useState(qParam)
  if (qParam !== lastQParam) {
    setLastQParam(qParam)
    setQ(qParam)
  }
  // IMP-01: جستجوی debounce شده سمت سرور + صفحه‌بندی
  const [debouncedQ, setDebouncedQ] = useState(qParam.trim())
  const [page, setPage] = useState(1)
  // فقط نسیه‌های بیش از ۳۰ روز (از بنر هشدار)
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get("overdue") === "1")
  // ADV-02: وضعیت ساخت خروجی اکسل
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim())
      setPage(1)
    }, 320)
    return () => clearTimeout(t)
  }, [q])

  const params = new URLSearchParams()
  if (type !== "ALL") params.set("type", type)
  if (personId) params.set("personId", personId)
  if (overdueOnly) params.set("overdue", "1")
  if (debouncedQ) params.set("q", debouncedQ)
  params.set("pageSize", String(PAGE_SIZE))
  if (page > 1) params.set("page", String(page))

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["invoices", type, personId, debouncedQ, page, overdueOnly],
    queryFn: () =>
      apiGet<{ invoices: Invoice[]; total: number; overdue: OverdueSummary }>(`/api/invoices?${params}`),
    placeholderData: (prev) => prev,
  })

  const { data: peopleData } = useQuery({
    queryKey: ["people", "all"],
    queryFn: () => apiGet<{ people: { id: string; name: string }[] }>("/api/people"),
  })

  // X1: فاکتوری که حذفش منتظر پایان فرصت «بازگردانی» است پنهان می‌ماند
  const invoices = (data?.invoices ?? []).filter((inv) => !pendingDeletes.includes(inv.id))
  const total = data?.total ?? 0
  const overdue = data?.overdue
  const hasMore = page * PAGE_SIZE < total
  const isEmpty = !isLoading && invoices.length === 0

  // X1: جستجوی بی‌نتیجه → نزدیک‌ترین نام شخص را پیشنهاد بده («شاید منظورتان … باشد»)
  const suggestKey = (debouncedQ.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "").trim()
  const { data: suggestData } = useQuery({
    queryKey: ["search-suggest", suggestKey],
    queryFn: () => apiGet<{ people: { id: string; name: string }[] }>(`/api/search?q=${encodeURIComponent(suggestKey)}`),
    enabled: isEmpty && suggestKey.length >= 2,
    staleTime: 60_000,
  })
  const suggestion = isEmpty ? suggestData?.people.find((p) => p.name !== debouncedQ.trim())?.name : undefined

  // ADV-02: دانلود مطمئن CSV — window.location.href داخل مینی‌اپ تلگرام کوکی نشست ندارد
  // (احراز هویت فقط با هدر x-telegram-init-data)؛ پس با fetch + blob دانلود می‌کنیم.
  const downloadCsv = async (type: "invoices" | "people" | "products") => {
    haptic.tap()
    try {
      setExporting(true)
      const headers: Record<string, string> = {}
      const initData = window.Telegram?.WebApp?.initData
      if (initData) headers["x-telegram-init-data"] = initData
      const res = await fetch(`/api/export?type=${type}`, { headers })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "خروجی ناموفق بود")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("content-disposition") || ""
      const m = /filename="?([^";]+)"?/.exec(cd)
      a.href = url
      a.download = m?.[1] || `hesabyar-${type}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success("فایل اکسل دانلود شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در خروجی")
    } finally {
      setExporting(false)
    }
  }

  // کشیدن ردیف → حذف بدون پنجرهٔ تأیید، با ۷ ثانیه فرصت «بازگردانی» (X1)
  const removeInvoice = (inv: Invoice) => {
    haptic.warning()
    const qty = inv.items.length
    deferDelete({
      id: inv.id,
      message: `فاکتور ${toPersianDigits(inv.number)} حذف شد`,
      description:
        inv.type === "SALE"
          ? `${toPersianDigits(qty)} قلم به انبار برگشت`
          : `${toPersianDigits(qty)} قلم از انبار کم شد`,
      commit: () => apiDelete(`/api/invoices/${inv.id}`),
      onCommitted: () => queryClient.invalidateQueries(),
    })
  }

  const hasFilters = !!(debouncedQ || personId || type !== "ALL" || overdueOnly)
  const clearFilters = () => {
    setQ("")
    setType("ALL")
    setPersonId(null)
    setOverdueOnly(false)
    setPage(1)
  }
  const overdueCount =
    (overdue ? (type !== "PURCHASE" ? overdue.sale.count : 0) + (type !== "SALE" ? overdue.purchase.count : 0) : 0)

  // نسخهٔ ۷: گروه‌بندی بر اساس روز (موبایل) — «امروز، ۳ فاکتور، ۲۸٫۱ م»
  const todayKey = jalaliDayKey(nowTehran())
  const yesterdayKey = jalaliDayKey(new Date(nowTehran().getTime() - 86_400_000))
  const groups: { key: string; label: string; items: Invoice[]; sum: number }[] = []
  for (const inv of invoices) {
    const d = new Date(inv.date)
    const key = jalaliDayKey(d)
    let g = groups.find((x) => x.key === key)
    if (!g) {
      const label =
        key === todayKey
          ? `امروز | ${formatJalaliShort(d)}`
          : key === yesterdayKey
            ? `دیروز | ${formatJalaliShort(d)}`
            : formatJalaliWithWeekday(d)
      g = { key, label, items: [], sum: 0 }
      groups.push(g)
    }
    g.items.push(inv)
    g.sum += inv.total
  }

  return (
    <div>
      <PageSub sub={total > 0 ? `${toPersianDigits(total)} فاکتور` : null} />
      <div className="mb-4 hidden items-end justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-page font-extrabold tracking-tight">فاکتورها</h1>
          {total > 0 && (
            <p className="nums mt-0.5 text-label text-muted-foreground">{toPersianDigits(total)} فاکتور</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => downloadCsv("invoices")}
            disabled={exporting}
            variant="outline"
            className="h-10 rounded-xl px-4 text-label font-bold hover:bg-accent"
            aria-label="خروجی اکسل"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            خروجی اکسل
          </Button>
          <Link href="/invoices/new">
            <Button className="h-10 rounded-xl px-4 text-label font-bold">
              <Plus className="size-4" />
              فاکتور جدید
            </Button>
          </Link>
        </div>
      </div>

      {/* فیلترها — جستجو + انتخاب‌گرهای یکدست (نوع، شخص) + چیپ‌ها (معوق، اکسل) */}
      <div className="mb-3 space-y-2.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="شخص، شمارهٔ فاکتور، کالا یا مبلغ"
            loading={isFetching && !!debouncedQ}
            hotkey
            className="lg:flex-1"
          />
          <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:shrink-0 lg:overflow-visible lg:[&_button]:h-11">
            <Select
              size="sm"
              value={type}
              onChange={(k) => {
                setType(k)
                setPage(1)
              }}
              title="نوع فاکتور"
              aria-label="نوع فاکتور"
              className="shrink-0"
              options={[
                { value: "ALL", label: "همه" },
                { value: "SALE", label: "فروش", icon: <span className="size-1.5 rounded-full bg-[color:var(--sale)]" /> },
                {
                  value: "PURCHASE",
                  label: "خرید",
                  icon: <span className="size-1.5 rounded-full bg-[color:var(--purchase)]" />,
                },
              ]}
            />
            <Select
              size="sm"
              value={personId ?? ""}
              onChange={(v) => {
                setPersonId(v || null)
                setPage(1)
              }}
              title="فیلتر بر اساس شخص"
              aria-label="شخص"
              className="w-44 shrink-0"
              options={[
                { value: "", label: "همهٔ اشخاص" },
                ...(peopleData?.people ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {(overdueCount > 0 || overdueOnly) && (
              <button
                type="button"
                onClick={() => {
                  haptic.tap()
                  setOverdueOnly((v) => !v)
                  setPage(1)
                }}
                aria-pressed={overdueOnly}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-label font-bold transition-colors",
                  overdueOnly ? "bg-warning-ink text-white" : "bg-warning/15 text-warning-ink hover:bg-warning/20"
                )}
              >
                <AlertTriangle className="size-3.5" />
                نسیهٔ معوق
                {overdueCount > 0 && (
                  <span
                    className={cn(
                      "nums grid h-5 min-w-5 place-items-center rounded-full px-1 text-caption",
                      overdueOnly ? "bg-white/25" : "bg-warning-ink text-white"
                    )}
                  >
                    {toPersianDigits(overdueCount)}
                  </span>
                )}
                {overdueOnly && <X className="size-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadCsv("invoices")}
              disabled={exporting}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-label font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 lg:hidden"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              اکسل
            </button>
          </div>
        </div>
        {overdueOnly && overdue && (
          <p className="nums text-caption text-muted-foreground">
            فاکتورهایی که بیش از {toPersianDigits(overdue.days)} روز نسیه مانده‌اند
            {type !== "PURCHASE" && overdue.sale.count > 0 && ` | فروش ${formatTomanCompact(overdue.sale.total)}`}
            {type !== "SALE" && overdue.purchase.count > 0 && ` | خرید ${formatTomanCompact(overdue.purchase.total)}`}
          </p>
        )}
      </div>

      {/* لیست — موبایل گروه‌بندی روزانه / دسکتاپ جدول (UI-09) */}
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="لیست فاکتورها بارگذاری نشد" onRetry={() => refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={hasFilters ? Search : FileText}
          title={
            debouncedQ
              ? `فاکتوری با «${debouncedQ}» پیدا نشد`
              : hasFilters
                ? "فاکتوری با این فیلترها نیست"
                : "هنوز فاکتوری ثبت نشده"
          }
          description={
            hasFilters
              ? [
                  debouncedQ && !suggestion && "املای نام یا شماره را بررسی کنید.",
                  type !== "ALL" && `فیلتر «${type === "SALE" ? "فروش" : "خرید"}» هم فعال است.`,
                  personId && "فیلتر شخص فعال است.",
                  overdueOnly && "فقط نسیه‌های معوق نمایش داده می‌شوند.",
                ]
                  .filter(Boolean)
                  .join(" ")
              : "اولین خرید یا فروش را ثبت کنید — ۳۰ ثانیه بیشتر طول نمی‌کشد"
          }
          hint={suggestion ? `شاید منظورتان «${suggestion}» باشد.` : undefined}
          actionLabel={suggestion ? `جستجوی «${suggestion}»` : hasFilters ? undefined : "ثبت اولین فاکتور"}
          actionTone={suggestion ? "tonal" : "primary"}
          onAction={
            suggestion
              ? () => {
                  setQ(suggestion)
                  setPage(1)
                }
              : hasFilters
                ? undefined
                : () => router.push("/invoices/new")
          }
          secondaryLabel={hasFilters ? "پاک کردن فیلترها" : undefined}
          onSecondary={hasFilters ? clearFilters : undefined}
        />
      ) : (
        <>
          {/* جدول دسکتاپ */}
          <div className="hidden overflow-hidden rounded-3xl border border-border/80 bg-card lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-caption text-muted-foreground">
                  <th className="px-4 py-3 text-start font-semibold">طرف حساب</th>
                  <th className="px-4 py-3 text-start font-semibold">نوع</th>
                  <th className="px-4 py-3 text-start font-semibold">شماره</th>
                  <th className="px-4 py-3 text-start font-semibold">تاریخ</th>
                  <th className="px-4 py-3 text-start font-semibold">کالاها</th>
                  <th className="px-4 py-3 text-end font-semibold">مبلغ</th>
                  <th className="px-4 py-3 text-end font-semibold">سود</th>
                  <th className="px-4 py-3 text-start font-semibold">وضعیت</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    className="group cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="group flex items-center gap-2.5">
                        <InvoiceTypeMark type={inv.type} size={34} />
                        <span className="font-bold">{inv.person.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceTypePill type={inv.type} />
                    </td>
                    <td className="nums px-4 py-3 text-label text-muted-foreground">#{toPersianDigits(inv.number)}</td>
                    <td className="nums px-4 py-3 text-label text-muted-foreground">
                      {formatJalaliShort(new Date(inv.date))}
                    </td>
                    <td className="max-w-64 truncate px-4 py-3 text-label text-muted-foreground">
                      {inv.items
                        .slice(0, 2)
                        .map((it) => `${toPersianDigits(it.quantity)} ${formatUnit(it.unit)} ${it.productName}`)
                        .join(" + ")}
                      {inv.items.length > 2 && ` +${toPersianDigits(inv.items.length - 2)}`}
                    </td>
                    <td className="nums px-4 py-3 text-end font-extrabold">{formatToman(inv.total, false)}</td>
                    <td className="nums px-4 py-3 text-end text-label font-bold">
                      {inv.type === "SALE" ? (
                        <span className={invoiceProfit(inv) >= 0 ? "text-income" : "text-destructive"}>
                          {formatToman(invoiceProfit(inv), false)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill credit={inv.credit} />
                    </td>
                    <td className="px-2 py-3">
                      <Link
                        href={`/invoices/new?edit=${inv.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`ویرایش فاکتور ${toPersianDigits(inv.number)}`}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Pencil className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="nums flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-caption text-muted-foreground">
              <span>
                {toPersianDigits(invoices.length)} از {toPersianDigits(total)} فاکتور
              </span>
            </div>
          </div>

          {/* موبایل — گروه‌بندی روزانه؛ کشیدن به چپ: ویرایش • کشیدن به راست: حذف */}
          <div className="space-y-4 lg:hidden">
            {groups.map((g, gi) => (
              <section key={g.key}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h3 className="nums text-label font-extrabold text-foreground/85">{g.label}</h3>
                  <span className="nums text-caption font-semibold text-muted-foreground">
                    {toPersianDigits(g.items.length)} فاکتور | {formatTomanCompact(g.sum)}
                  </span>
                </div>
                <div className="overflow-hidden rounded-3xl border border-border/80 bg-card">
                  {g.items.map((inv, i) => {
                    const profit = invoiceProfit(inv)
                    return (
                      <motion.div
                        key={inv.id}
                        layout="position"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min((gi * 3 + i) * 0.03, 0.3), type: "spring", stiffness: 380, damping: 32 }}
                        className={cn(i > 0 && "border-t border-border/60")}
                      >
                        <SwipeRow
                          hint
                          leading={[
                            {
                              key: "edit",
                              label: "ویرایش",
                              icon: Pencil,
                              tone: "brand",
                              navigates: true,
                              onAction: () => router.push(`/invoices/new?edit=${inv.id}`),
                            },
                          ]}
                          trailing={[
                            {
                              key: "delete",
                              label: "حذف",
                              icon: Trash2,
                              tone: "danger",
                              // تا پایان فرصت «بازگردانی» از فهرست پنهان می‌ماند
                              removes: true,
                              onAction: () => removeInvoice(inv),
                            },
                          ]}
                        >
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="flex items-center gap-3 bg-card px-3.5 py-3 transition-colors active:bg-accent/40"
                          >
                            <InvoiceTypeMark type={inv.type} size={42} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-body font-bold">{inv.person.name}</div>
                              <div className="nums mt-0.5 truncate text-caption text-muted-foreground">
                                {inv.type === "SALE" ? "فروش" : "خرید"}
                                {inv.items.length > 0 && ` | ${toPersianDigits(inv.items.length)} قلم`} | ش {toPersianDigits(inv.number)}
                                {inv.type === "SALE" && (
                                  <span className={cn("font-bold", profit >= 0 ? "text-income" : "text-destructive")}>
                                     | سود {formatTomanCompact(profit)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-end">
                              <div className="nums text-body font-extrabold leading-tight">
                                {formatToman(inv.total, false)}
                              </div>
                              <div className="mt-1 flex justify-end">
                                <StatusPill credit={inv.credit} />
                              </div>
                            </div>
                          </Link>
                        </SwipeRow>
                      </motion.div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* صفحه‌بندی — IMP-01 */}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                variant="outline"
                className="h-12 rounded-2xl px-8 text-label font-bold hover:bg-accent"
              >
                {isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                فاکتورهای بیشتر ({toPersianDigits(total - page * PAGE_SIZE)} باقی‌مانده)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface OverdueSummary {
  days: number
  sale: { count: number; total: number }
  purchase: { count: number; total: number }
}

/** وضعیت پرداخت: «مانده X» (کهربایی) یا «تسویه» با تیک (سبز) */
function StatusPill({ credit }: { credit: number }) {
  if (credit > 0)
    return (
      <span className="nums inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-caption font-bold leading-4 text-warning-ink">
        مانده {formatTomanCompact(credit)}
      </span>
    )
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-income/10 px-2 py-0.5 text-caption font-bold leading-4 text-income">
      <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      تسویه
    </span>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <InvoicesPageInner />
    </Suspense>
  )
}

/** زیرعنوان هدر موبایل («۳۴۸ فاکتور») */
function PageSub({ sub }: { sub: string | null }) {
  usePageSub(sub)
  return null
}
