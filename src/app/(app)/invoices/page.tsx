"use client"

/**
 * لیست فاکتورها — فیلتر نوع/شخص، جستجوی سروری + صفحه‌بندی واقعی (IMP-01)
 * موبایل: کارت‌های عمودی • دسکتاپ: جدول پهن (UI-09)
 */
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Plus,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  ChevronLeft,
  Search,
  CalendarDays,
  X,
  Download,
  ChevronDown,
  Loader2,
  ShoppingCart,
  ReceiptText,
  TrendingUp,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, formatJalaliShort } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ListSkeleton } from "@/components/ui/page-skeletons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { cn } from "@/lib/utils"

interface Invoice {
  id: string
  number: number
  type: string
  date: string
  total: number
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

/** سود ناخالص یک فاکتور فروش از روی اسنپ‌شات قیمت تمام‌شده اقلام */
function invoiceProfit(inv: Invoice): number {
  if (inv.type !== "SALE") return 0
  return Math.round(
    inv.items.reduce((s, it) => s + (it.unitPrice - (it.costPrice || 0)) * it.quantity, 0)
  )
}

const PAGE_SIZE = 25

function InvoicesPageInner() {
  const searchParams = useSearchParams()
  const { haptic } = useTelegram()
  const openAddSheet = useUIStore((s) => s.openAddSheet)
  const [type, setType] = useState<"ALL" | "SALE" | "PURCHASE">("ALL")
  const [personId, setPersonId] = useState<string | null>(searchParams.get("person"))
  const [personName, setPersonName] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [personSheet, setPersonSheet] = useState(false)
  // IMP-01: جستجوی debounce شده سمت سرور + صفحه‌بندی
  const [debouncedQ, setDebouncedQ] = useState("")
  const [page, setPage] = useState(1)
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
  if (debouncedQ) params.set("q", debouncedQ)
  params.set("pageSize", String(PAGE_SIZE))
  if (page > 1) params.set("page", String(page))

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["invoices", type, personId, debouncedQ, page],
    queryFn: () =>
      apiGet<{ invoices: Invoice[]; total: number; totalProfit: number }>(`/api/invoices?${params}`),
    placeholderData: (prev) => prev,
  })

  const { data: peopleData } = useQuery({
    queryKey: ["people", "all"],
    queryFn: () => apiGet<{ people: { id: string; name: string }[] }>("/api/people"),
    enabled: personSheet,
  })

  const invoices = data?.invoices ?? []
  const total = data?.total ?? 0
  const totalProfit = data?.totalProfit ?? 0
  const hasMore = page * PAGE_SIZE < total
  const isEmpty = !isLoading && invoices.length === 0

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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">
          فاکتورها
          {total > 0 && (
            <span className="nums ms-2 text-xs font-medium text-muted-foreground">
              {toPersianDigits(total)} فاکتور
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => downloadCsv("invoices")}
            disabled={exporting}
            variant="outline"
            className="hidden h-10 rounded-2xl px-4 text-xs font-bold hover:bg-accent sm:flex"
            aria-label="خروجی اکسل"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            اکسل
          </Button>
          <Link href="/invoices/new?type=SALE">
            <Button className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab">
              <Plus className="size-4" />
              فاکتور جدید
            </Button>
          </Link>
        </div>
      </div>

      {/* فیلترها */}
      <div className="mb-4 space-y-2.5">
        <div className="flex gap-2">
          {(
            [
              { key: "ALL", label: "همه" },
              { key: "SALE", label: "فروش" },
              { key: "PURCHASE", label: "خرید" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                haptic.tap()
                setType(f.key)
                setPage(1)
              }}
              className={cn(
                "flex-1 rounded-2xl border py-2.5 text-xs font-bold transition-all sm:flex-none sm:px-6",
                type === f.key
                  ? f.key === "SALE"
                    ? "border-income bg-income/10 text-income"
                    : f.key === "PURCHASE"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی شخص، شماره فاکتور یا جنس…"
              className="field ps-10"
              inputMode="search"
            />
          </div>
          <button
            type="button"
            onClick={() => setPersonSheet(true)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-xs font-bold transition-colors",
              personId
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {personId ? <X className="size-3.5" /> : <Filter className="size-3.5" />}
            {personId ? (personName ?? "شخص") : "فیلتر شخص"}
          </button>
          <button
            type="button"
            onClick={() => downloadCsv("invoices")}
            disabled={exporting}
            aria-label="خروجی اکسل"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 sm:hidden"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </button>
        </div>
      </div>

      {/* جمع سود ناخالص فروشِ همین فیلتر — فقط نمایش داخلی (حساب کتاب) */}
      {totalProfit > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-income/25 bg-income/5 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[0.7rem] font-bold text-income">
            <TrendingUp className="size-3.5" />
            سود ناخالص فروش{type === "SALE" ? "" : " (فقط فروش‌ها)"}
          </span>
          <span className="nums text-xs font-extrabold text-income">
            {formatToman(totalProfit, false)} تومان
          </span>
        </div>
      )}

      {/* لیست — موبایل کارت / دسکتاپ جدول (UI-09) */}
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="لیست فاکتورها بارگذاری نشد" onRetry={() => refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={FileText}
          title={debouncedQ || personId || type !== "ALL" ? "فاکتوری با این فیلترها نیست" : "هنوز فاکتوری ثبت نشده"}
          description={
            debouncedQ || personId || type !== "ALL"
              ? "فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید"
              : "اولین خرید یا فروش را ثبت کنید — ۳۰ ثانیه بیشتر طول نمی‌کشد"
          }
          actionLabel={debouncedQ || personId || type !== "ALL" ? undefined : "ثبت اولین فاکتور"}
          onAction={debouncedQ || personId || type !== "ALL" ? undefined : openAddSheet}
        />
      ) : (
        <>
          {/* جدول دسکتاپ */}
          <div className="hidden overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-[0.7rem] text-muted-foreground">
                  <th className="px-4 py-3 text-start font-medium">شخص</th>
                  <th className="px-4 py-3 text-start font-medium">نوع</th>
                  <th className="px-4 py-3 text-start font-medium">شماره</th>
                  <th className="px-4 py-3 text-start font-medium">تاریخ</th>
                  <th className="px-4 py-3 text-start font-medium">اجناس</th>
                  <th className="px-4 py-3 text-end font-medium">مبلغ</th>
                  <th className="px-4 py-3 text-end font-medium">سود</th>
                  <th className="px-4 py-3 text-end font-medium">مانده</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => (window.location.href = `/invoices/${inv.id}`)}
                    className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-xl",
                            inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                          )}
                        >
                          {inv.type === "SALE" ? (
                            <ReceiptText className="size-[1.1rem]" strokeWidth={2.1} />
                          ) : (
                            <ShoppingCart className="size-[1.1rem]" strokeWidth={2.1} />
                          )}
                        </span>
                        <span className="font-bold">{inv.person.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-px text-[0.65rem] font-bold",
                          inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {inv.type === "SALE" ? "فروش" : "خرید"}
                      </span>
                    </td>
                    <td className="nums px-4 py-3 text-xs text-muted-foreground">{toPersianDigits(inv.number)}</td>
                    <td className="nums px-4 py-3 text-xs text-muted-foreground">
                      {formatJalaliShort(new Date(inv.date))}
                    </td>
                    <td className="max-w-64 truncate px-4 py-3 text-xs text-muted-foreground">
                      {inv.items
                        .slice(0, 2)
                        .map((it) => `${toPersianDigits(it.quantity)} ${formatUnit(it.unit)} ${it.productName}`)
                        .join(" + ")}
                      {inv.items.length > 2 && ` +${toPersianDigits(inv.items.length - 2)}`}
                    </td>
                    <td className="nums px-4 py-3 text-end font-extrabold">{formatToman(inv.total, false)}</td>
                    <td className="px-4 py-3 text-end">
                      {inv.type === "SALE" ? (
                        <span
                          className={cn(
                            "nums rounded-md px-1.5 py-px text-[0.65rem] font-bold",
                            invoiceProfit(inv) >= 0
                              ? "bg-income/10 text-income"
                              : "bg-destructive/10 text-destructive"
                          )}
                        >
                          {formatToman(invoiceProfit(inv), false)}
                        </span>
                      ) : (
                        <span className="text-[0.65rem] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {inv.credit > 0 ? (
                        <span className="rounded-md bg-warning/10 px-1.5 py-px text-[0.65rem] font-bold text-warning">
                          {formatToman(inv.credit, false)}
                        </span>
                      ) : (
                        <span className="rounded-md bg-income/10 px-1.5 py-px text-[0.65rem] font-bold text-income">
                          تسویه ✓
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* کارت‌های موبایل */}
          <div className="space-y-2.5 lg:hidden">
            {invoices.map((inv, i) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
              >
                <Link
                  href={`/invoices/${inv.id}`}
                  className="block rounded-3xl border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-card-hover active:scale-[0.995]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                        inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {inv.type === "SALE" ? (
                        <ReceiptText className="size-5" strokeWidth={2.1} />
                      ) : (
                        <ShoppingCart className="size-5" strokeWidth={2.1} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-extrabold">{inv.person.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                            inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                          )}
                        >
                          {inv.type === "SALE" ? "فروش" : "خرید"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                        <CalendarDays className="size-3" />
                        <span className="nums">{formatJalaliWithWeekday(new Date(inv.date))}</span>
                        <span className="mx-1">•</span>
                        <span className="nums">شماره {toPersianDigits(inv.number)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="nums text-sm font-extrabold">{formatToman(inv.total, false)}</div>
                      {inv.type === "SALE" && (
                        <div
                          className={cn(
                            "nums mt-0.5 text-[0.62rem] font-bold",
                            invoiceProfit(inv) >= 0 ? "text-income" : "text-destructive"
                          )}
                        >
                          سود {formatToman(invoiceProfit(inv), false)}
                        </div>
                      )}
                      <div className="mt-0.5">
                        {inv.credit > 0 ? (
                          <span className="rounded-md bg-warning/10 px-1.5 py-px text-[0.6rem] font-bold text-warning">
                            مانده {formatToman(inv.credit, false)}
                          </span>
                        ) : (
                          <span className="rounded-md bg-income/10 px-1.5 py-px text-[0.6rem] font-bold text-income">
                            تسویه ✓
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronLeft className="size-4 shrink-0 text-muted-foreground/50" />
                  </div>
                  {inv.items.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1 border-t border-dashed pt-2.5">
                      {inv.items.slice(0, 3).map((it) => (
                        <span
                          key={it.id}
                          className="nums max-w-full truncate rounded-lg bg-muted px-2 py-1 text-[0.62rem] text-muted-foreground"
                        >
                          {toPersianDigits(it.quantity)} {formatUnit(it.unit)} {it.productName}
                        </span>
                      ))}
                      {inv.items.length > 3 && (
                        <span className="rounded-lg bg-muted px-2 py-1 text-[0.62rem] text-muted-foreground">
                          +{toPersianDigits(inv.items.length - 3)} مورد
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>

          {/* صفحه‌بندی — IMP-01 */}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                variant="outline"
                className="h-12 rounded-2xl px-8 text-xs font-bold hover:bg-accent"
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

      {/* شیت فیلتر شخص */}
      <BottomSheet
        open={personSheet}
        onClose={() => setPersonSheet(false)}
        title="فیلتر بر اساس شخص"
        size="tall"
      >
        <div className="space-y-2">
          <SheetOption
            title="همه اشخاص"
            onClick={() => {
              setPersonId(null)
              setPersonName(null)
              setPersonSheet(false)
              setPage(1)
            }}
          />
          {(peopleData?.people ?? []).map((p) => (
            <SheetOption
              key={p.id}
              title={p.name}
              selected={personId === p.id}
              onClick={() => {
                setPersonId(p.id)
                setPersonName(p.name)
                setPersonSheet(false)
                setPage(1)
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <InvoicesPageInner />
    </Suspense>
  )
}
