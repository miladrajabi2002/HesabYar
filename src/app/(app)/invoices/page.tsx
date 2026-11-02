"use client"

/**
 * لیست فاکتورها — فیلتر نوع/شخص، جستجوی سروری + صفحه‌بندی واقعی (IMP-01)
 * موبایل: کارت‌های عمودی • دسکتاپ: جدول پهن (UI-09)
 */
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Plus,
  FileText,
  ChevronLeft,
  Search,
  Download,
  ChevronDown,
  Loader2,
  TrendingUp,
  UserRound,
  Pencil,
  Trash2,
} from "lucide-react"
import { apiDelete, apiGet } from "@/lib/api-client"
import { invoiceProfit } from "@/lib/finance-math"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ListSkeleton } from "@/components/ui/page-skeletons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { useConfirm } from "@/components/ui/confirm"
import { Segmented, FilterChip } from "@/components/ui/segmented"
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
  const { confirm } = useConfirm()
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

  // کشیدن ردیف → حذف (با تأیید)
  const removeInvoice = async (inv: Invoice) => {
    haptic.warning()
    const okRemove = await confirm({
      title: "حذف فاکتور",
      description: `فاکتور ${toPersianDigits(inv.number)} «${inv.person.name}» با همهٔ اقلام، چک‌ها و تسویه‌هایش حذف شود؟`,
      confirmText: "بله، حذف کن",
      tone: "danger",
    })
    if (!okRemove) return
    try {
      await apiDelete(`/api/invoices/${inv.id}`)
      haptic.success()
      toast.success(`فاکتور ${toPersianDigits(inv.number)} حذف شد`)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف ناموفق بود")
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

      {/* فیلترها — قرص لغزان نوع + جستجو + چیپ شخص */}
      <div className="mb-4 space-y-2.5">
        <Segmented
          value={type}
          onChange={(k) => {
            haptic.tap()
            setType(k)
            setPage(1)
          }}
          options={[
            { key: "ALL", label: "همه" },
            { key: "SALE", label: "فروش", tone: "var(--sale)", icon: <span className="size-1.5 rounded-full bg-[color:var(--sale)]" /> },
            {
              key: "PURCHASE",
              label: "خرید",
              tone: "var(--purchase)",
              icon: <span className="size-1.5 rounded-full bg-[color:var(--purchase)]" />,
            },
          ]}
          className="sm:max-w-sm"
        />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="شخص، شماره فاکتور یا جنس…"
              className="field ps-10"
              inputMode="search"
            />
            {isFetching && debouncedQ && (
              <Loader2 className="absolute inset-y-0 end-3.5 my-auto size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <FilterChip
            active={!!personId}
            label={personId ? (personName ?? "شخص") : "شخص"}
            icon={<UserRound className="size-4" />}
            onClick={() => setPersonSheet(true)}
            onClear={() => {
              setPersonId(null)
              setPersonName(null)
              setPage(1)
            }}
          />
          <button
            type="button"
            onClick={() => downloadCsv("invoices")}
            disabled={exporting}
            aria-label="خروجی اکسل"
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-input bg-card text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 sm:hidden"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </button>
        </div>
      </div>

      {/* جمع سود ناخالص فروشِ همین فیلتر — فقط نمایش داخلی (حساب کتاب) */}
      {totalProfit > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-center justify-between rounded-2xl bg-gradient-to-l from-income/12 to-income/4 px-4 py-2.5 ring-1 ring-income/15"
        >
          <span className="flex items-center gap-2 text-[0.7rem] font-bold text-income">
            <span className="grid size-6 place-items-center rounded-lg bg-income text-white">
              <TrendingUp className="size-3.5" />
            </span>
            سود ناخالص فروش{type === "SALE" ? "" : " (فقط فروش‌ها)"}
          </span>
          <span className="nums text-sm font-extrabold text-income">
            {formatToman(totalProfit, false)} <span className="text-[0.62rem] font-medium opacity-70">تومان</span>
          </span>
        </motion.div>
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
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    style={{ ["--i" as string]: invoices.indexOf(inv) }}
                    className="hy-rise group cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="group flex items-center gap-2.5">
                        <InvoiceTypeMark type={inv.type} size={38} />
                        <span className="font-bold">{inv.person.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceTypePill type={inv.type} />
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
                        <SettledPill />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* کارت‌های موبایل — کشیدن به چپ: ویرایش • کشیدن به راست: حذف */}
          <div className="space-y-2.5 lg:hidden">
            {invoices.map((inv, i) => {
              const profit = invoiceProfit(inv)
              return (
                <motion.div
                  key={inv.id}
                  layout="position"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.035, 0.35), type: "spring", stiffness: 380, damping: 32 }}
                >
                  <SwipeRow
                    hint={i === 0}
                    trailing={[
                      {
                        key: "edit",
                        label: "ویرایش",
                        icon: <Pencil className="size-4" />,
                        color: "var(--primary)",
                        onAction: () => router.push(`/invoices/new?edit=${inv.id}`),
                      },
                    ]}
                    leading={[
                      {
                        key: "delete",
                        label: "حذف",
                        icon: <Trash2 className="size-4" />,
                        color: "var(--destructive)",
                        onAction: () => removeInvoice(inv),
                      },
                    ]}
                  >
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="group block rounded-3xl border border-border/70 bg-card p-3.5 shadow-card transition-shadow hover:shadow-card-hover active:bg-accent/30"
                    >
                      <div className="flex items-center gap-3">
                        <InvoiceTypeMark type={inv.type} size={46} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-extrabold">{inv.person.name}</span>
                            <InvoiceTypePill type={inv.type} />
                          </div>
                          <div className="nums mt-1 text-[0.66rem] text-muted-foreground">
                            {formatJalaliShort(new Date(inv.date))}
                            <span className="mx-1.5 opacity-40">|</span>
                            ش {toPersianDigits(inv.number)}
                            {inv.items.length > 0 && (
                              <>
                                <span className="mx-1.5 opacity-40">|</span>
                                {toPersianDigits(inv.items.length)} قلم
                              </>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="nums text-[0.95rem] font-extrabold leading-tight">
                            {formatToman(inv.total, false)}
                          </div>
                          <div className="mt-1 flex justify-end">
                            {inv.credit > 0 ? (
                              <span className="nums rounded-full bg-warning/12 px-2 py-0.5 text-[0.58rem] font-bold text-[color:color-mix(in_srgb,var(--warning)_75%,black)]">
                                مانده {formatToman(inv.credit, false)}
                              </span>
                            ) : (
                              <SettledPill />
                            )}
                          </div>
                        </div>
                      </div>
                      {(inv.items.length > 0 || inv.type === "SALE") && (
                        <div className="mt-2.5 flex items-center gap-2 border-t border-dashed border-border/80 pt-2.5">
                          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
                            {inv.items.slice(0, 2).map((it) => (
                              <span
                                key={it.id}
                                className="nums max-w-[48%] truncate rounded-lg bg-muted px-2 py-1 text-[0.6rem] text-muted-foreground"
                              >
                                {toPersianDigits(it.quantity)} {formatUnit(it.unit)} {it.productName}
                              </span>
                            ))}
                            {inv.items.length > 2 && (
                              <span className="nums shrink-0 rounded-lg bg-muted px-2 py-1 text-[0.6rem] text-muted-foreground">
                                +{toPersianDigits(inv.items.length - 2)}
                              </span>
                            )}
                          </div>
                          {inv.type === "SALE" && (
                            <span
                              className={cn(
                                "nums inline-flex shrink-0 items-center gap-0.5 text-[0.62rem] font-bold",
                                profit >= 0 ? "text-income" : "text-destructive"
                              )}
                            >
                              <TrendingUp className={cn("size-3", profit < 0 && "-scale-y-100")} />
                              {formatToman(Math.abs(profit), false)}
                            </span>
                          )}
                          <ChevronLeft className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5" />
                        </div>
                      )}
                    </Link>
                  </SwipeRow>
                </motion.div>
              )
            })}
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

/** برچسب «تسویه» با تیک */
function SettledPill() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-income/10 px-2 py-0.5 text-[0.58rem] font-bold text-income">
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
