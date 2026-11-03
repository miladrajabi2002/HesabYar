"use client"

/**
 * لیست اشخاص — مشتری/تأمین‌کننده با تراز طلب/بدهی + افزودن سریع
 * مرتب‌سازی: بیشترین مانده / بیشترین فروش / بیشترین خرید / قدیمی‌ترین مانده
 * حلقهٔ آواتار = چند روز است حساب باز مانده (بیش از ۳۰ روز قرمز)
 */
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePageSub } from "@/components/layout/page-header"
import { toast } from "sonner"
import {
  Users,
  Plus,
  Search,
  Loader2,
  ChevronLeft,
  HandCoins,
  Building2,
  UserRound,
  Download,
  Phone,
} from "lucide-react"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatTomanCompact, toLatinDigits, toPersianDigits } from "@/lib/money"
import { PersonFields } from "@/components/people/person-fields"
import { EmptyState } from "@/components/ui/empty-state"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { BalanceAvatar, BalanceTag, ROLE_LABELS, formatOpenDays } from "@/components/ui/role-avatar"
import { SearchField } from "@/components/ui/search-field"
import { Segmented } from "@/components/ui/segmented"
import { SwipeRow } from "@/components/ui/swipe-row"
import { cn } from "@/lib/utils"

interface Person {
  id: string
  name: string
  phone: string | null
  company: string | null
  shopAddress: string | null
  role: string
  balance: number
  salesTotal: number
  purchaseTotal: number
  /** روزهای باز ماندن مانده (null = تسویه یا بدون فاکتور مانده‌دار) */
  openDays: number | null
}

type SortKey = "balance" | "sales" | "purchases" | "age"

const SORTS: Record<SortKey, { label: string; compare: (a: Person, b: Person) => number }> = {
  balance: { label: "بیشترین مانده", compare: (a, b) => Math.abs(b.balance) - Math.abs(a.balance) },
  sales: { label: "بیشترین فروش", compare: (a, b) => b.salesTotal - a.salesTotal },
  purchases: { label: "بیشترین خرید", compare: (a, b) => b.purchaseTotal - a.purchaseTotal },
  age: { label: "قدیمی‌ترین", compare: (a, b) => (b.openDays ?? -1) - (a.openDays ?? -1) },
}

function PeoplePageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const qParam = searchParams.get("q") ?? ""
  const [q, setQ] = useState(qParam)
  // «همه در صفحهٔ خودش» از جستجوی سراسری: ?q= تازه فیلد را پر می‌کند
  const [lastQParam, setLastQParam] = useState(qParam)
  if (qParam !== lastQParam) {
    setLastQParam(qParam)
    setQ(qParam)
  }
  // هر حرف یک درخواست نفرستد
  const [debouncedQ, setDebouncedQ] = useState(qParam.trim())
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const [role, setRole] = useState<"ALL" | "CUSTOMER" | "SUPPLIER">("ALL")
  const [balanceFilter, setBalanceFilter] = useState<"all" | "debtors" | "creditors">(() => {
    const f = searchParams.get("filter")
    return f === "debtors" || f === "creditors" ? f : "all"
  })
  const [sort, setSort] = useState<SortKey>("balance")
  const [addSheet, setAddSheet] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ADV-02: دانلود مطمئن CSV — window.location.href داخل مینی‌اپ تلگرام کوکی نشست ندارد
  // (احراز هویت فقط با هدر x-telegram-init-data)؛ پس با fetch + blob دانلود می‌کنیم.
  const downloadCsv = async (type: "invoices" | "people" | "products") => {
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

  const params = new URLSearchParams()
  if (role !== "ALL") params.set("role", role)
  if (debouncedQ) params.set("q", debouncedQ)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["people", role, debouncedQ],
    queryFn: () => apiGet<{ people: Person[] }>(`/api/people?${params}`),
    // هنگام تایپ فهرست قبلی می‌ماند تا نتیجهٔ تازه برسد (بدون چشمک اسکلت)
    placeholderData: (prev) => prev,
  })

  let people = data?.people ?? []
  if (balanceFilter === "debtors") people = people.filter((p) => p.balance > 0)
  if (balanceFilter === "creditors") people = people.filter((p) => p.balance < 0)
  // رتبه‌بندی خرید/فروش فقط کسانی که واقعاً معامله داشته‌اند؛ «قدیمی‌ترین» فقط مانده‌دارها
  if (sort === "sales") people = people.filter((p) => p.salesTotal > 0)
  if (sort === "purchases") people = people.filter((p) => p.purchaseTotal > 0)
  if (sort === "age") people = people.filter((p) => p.openDays != null)
  people = [...people].sort(SORTS[sort].compare)

  const totalReceivable = people.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const totalPayable = -people.reduce((s, p) => s + Math.min(0, p.balance), 0)
  const debtorCount = people.filter((p) => p.balance > 0).length
  const creditorCount = people.filter((p) => p.balance < 0).length
  const peopleSub = data ? `${toPersianDigits(data.people.length)} شخص | ${toPersianDigits(debtorCount)} بدهکار به شما` : null
  usePageSub(peopleSub)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-page font-extrabold tracking-tight">اشخاص</h1>
          {peopleSub && <p className="nums text-label text-muted-foreground">{peopleSub}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => downloadCsv("people")}
            variant="outline"
            disabled={exporting}
            className="h-10 rounded-xl px-4 text-label font-bold hover:bg-accent"
            aria-label="خروجی اکسل اشخاص"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">اکسل</span>
          </Button>
          <Button onClick={() => setAddSheet(true)} className="h-10 rounded-xl px-4 text-label font-bold">
            <Plus className="size-4" />
            افزودن شخص
          </Button>
        </div>
      </div>

      {/* خلاصه طلب/بدهی — یک کارت دوتکه؛ لمس = فیلتر (نسخهٔ ۷) */}
      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-3xl border border-border/80 bg-card">
        {(
          [
            { key: "debtors", label: `طلب شما از ${toPersianDigits(debtorCount)} نفر`, value: totalReceivable, cls: "text-warning-ink" },
            { key: "creditors", label: `بدهی شما به ${toPersianDigits(creditorCount)} نفر`, value: totalPayable, cls: "text-purchase" },
          ] as const
        ).map((c, i) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setBalanceFilter(balanceFilter === c.key ? "all" : c.key)}
            aria-pressed={balanceFilter === c.key}
            className={cn(
              "px-4 py-3 text-start transition-colors hover:bg-accent/40",
              i > 0 && "border-s border-border/80",
              balanceFilter === c.key && "bg-accent/60"
            )}
          >
            <div className="text-label font-semibold text-muted-foreground">{c.label}</div>
            <p className={cn("nums mt-0.5 text-xl font-extrabold tracking-tight", c.cls)}>
              {formatTomanCompact(c.value)}
            </p>
          </button>
        ))}
      </div>

      {/* فیلترها */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="نام، موبایل، شرکت یا آدرس"
            loading={isFetching && !!debouncedQ}
            hotkey
            className="lg:flex-1"
          />
          <Segmented
            value={role}
            onChange={setRole}
            options={[
              { key: "ALL", label: "همه" },
              { key: "CUSTOMER", label: "مشتری‌ها", tone: "var(--role-customer)" },
              { key: "SUPPLIER", label: "فروشنده‌ها", tone: "var(--role-supplier)" },
            ]}
            className="sm:max-w-md lg:w-96"
          />
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          size="sm"
          options={[
            { key: "balance", label: "بیشترین مانده" },
            { key: "sales", label: "بیشترین فروش", tone: "var(--sale)" },
            { key: "purchases", label: "بیشترین خرید", tone: "var(--purchase)" },
            { key: "age", label: "قدیمی‌ترین", tone: "var(--destructive)" },
          ]}
          className="sm:max-w-md"
        />
        <AnimatePresence initial={false}>
          {balanceFilter !== "all" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setBalanceFilter("all")}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-caption font-bold text-background"
              >
                {balanceFilter === "debtors" ? "فقط بدهکاران به ما" : "فقط طلبکاران از ما"}
                <span className="opacity-60">✕</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* لیست — کشیدن به چپ: تسویه • کشیدن به راست: تماس */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          icon={debouncedQ ? Search : Users}
          title={debouncedQ ? `کسی با «${debouncedQ}» پیدا نشد` : role !== "ALL" || balanceFilter !== "all" ? "کسی با این فیلتر نیست" : "شخصی ثبت نشده"}
          description="هنگام ثبت فاکتور هم می‌توانید سریع شخص اضافه کنید."
          actionLabel={q || role !== "ALL" || balanceFilter !== "all" ? undefined : "افزودن شخص"}
          onAction={q || role !== "ALL" || balanceFilter !== "all" ? undefined : () => setAddSheet(true)}
          secondaryLabel={q || role !== "ALL" || balanceFilter !== "all" ? "پاک کردن فیلترها" : undefined}
          onSecondary={
            q || role !== "ALL" || balanceFilter !== "all"
              ? () => {
                  setQ("")
                  setRole("ALL")
                  setBalanceFilter("all")
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border/80 bg-card">
          {people.map((p, i) => (
            <motion.div
              key={p.id}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.25), type: "spring", stiffness: 380, damping: 32 }}
              className={cn(i > 0 && "border-t border-border/60")}
            >
              <SwipeRow
                hint
                leading={[
                  {
                    key: "settle",
                    label: p.balance < 0 ? "پرداخت" : "دریافت",
                    icon: HandCoins,
                    tone: p.balance < 0 ? "supplier" : "warning",
                    navigates: true,
                    onAction: () => router.push(`/people/${p.id}?settle=${p.balance < 0 ? "PAY" : "RECEIVE"}`),
                  },
                ]}
                trailing={
                  p.phone
                    ? [
                        {
                          key: "call",
                          label: "تماس",
                          icon: Phone,
                          tone: "ok",
                          onAction: () => {
                            window.location.href = `tel:${toLatinDigits(p.phone!)}`
                          },
                        },
                      ]
                    : []
                }
              >
                <Link
                  href={`/people/${p.id}`}
                  className="group block bg-card px-3.5 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60"
                >
                  <div className="flex items-center gap-3">
                    <BalanceAvatar role={p.role} balance={p.balance} openDays={p.openDays} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-bold">{p.name}</div>
                      <div className="mt-0.5 truncate text-caption text-muted-foreground">
                        {[ROLE_LABELS[p.role], p.company].filter(Boolean).join(" | ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      {sort === "sales" || sort === "purchases" ? (
                        <>
                          <div
                            className="nums text-sm font-extrabold"
                            style={{ color: sort === "sales" ? "var(--sale)" : "var(--purchase)" }}
                          >
                            {formatTomanCompact(sort === "sales" ? p.salesTotal : p.purchaseTotal)}
                          </div>
                          <div className="mt-0.5 text-caption font-bold text-muted-foreground">
                            <span className="nums">#{toPersianDigits(i + 1)}</span> {sort === "sales" ? "جمع فروش" : "جمع خرید"}
                          </div>
                        </>
                      ) : p.balance !== 0 ? (
                        <>
                          <div className="nums text-body font-extrabold">{formatTomanCompact(Math.abs(p.balance))}</div>
                          <div className="mt-1 flex items-center justify-end gap-1">
                            {p.openDays != null && (
                              <span
                                className={cn(
                                  "nums text-caption font-bold",
                                  p.openDays > 30 ? "text-destructive" : "text-muted-foreground"
                                )}
                              >
                                {formatOpenDays(p.openDays)}
                              </span>
                            )}
                            <BalanceTag balance={p.balance} />
                          </div>
                        </>
                      ) : (
                        <BalanceTag balance={0} />
                      )}
                    </div>
                    <ChevronLeft className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5" />
                  </div>
                </Link>
              </SwipeRow>
            </motion.div>
          ))}
        </div>
      )}

      <AddPersonSheet
        open={addSheet}
        onClose={() => setAddSheet(false)}
        onCreated={async () => {
          setAddSheet(false)
          await queryClient.invalidateQueries()
        }}
      />
    </div>
  )
}

export function AddPersonSheet({
  open,
  onClose,
  onCreated,
  initialRole = "CUSTOMER",
}: {
  open: boolean
  onClose: () => void
  onCreated: (p: Person) => void | Promise<void>
  initialRole?: string
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [shopAddress, setShopAddress] = useState("")
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH">(initialRole as "CUSTOMER")
  // ── مانده اولیه (حساب قدیمی) ──
  // none = بدون مانده | receivable = شخص به ما بدهکار است (طلب ما)
  // payable = ما به شخص بدهکاریم (بدهی ما)
  const [openingKind, setOpeningKind] = useState<"none" | "receivable" | "payable">("none")
  const [openingAmount, setOpeningAmount] = useState(0)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    if (openingKind !== "none" && openingAmount <= 0)
      return toast.error("مبلغ مانده اولیه را وارد کنید")
    setSaving(true)
    try {
      const r = await apiPost<{ person: Person }>("/api/people", {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role,
        // مثبت = طلب اولیه ما از شخص | منفی = بدهی اولیه ما به شخص
        openingBalance:
          openingKind === "none" ? 0 : openingKind === "receivable" ? openingAmount : -openingAmount,
      })
      toast.success("شخص ثبت شد")
      setName("")
      setPhone("")
      setCompany("")
      setShopAddress("")
      setOpeningKind("none")
      setOpeningAmount(0)
      await onCreated(r.person)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="شخص جدید"
      size="tall"
      footer={
        <Button onClick={submit} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          ذخیرهٔ شخص
        </Button>
      }
    >
      <PersonFields
          name={name}
          setName={setName}
          phone={phone}
          setPhone={setPhone}
          company={company}
          setCompany={setCompany}
          shopAddress={shopAddress}
          setShopAddress={setShopAddress}
          openingKind={openingKind}
          setOpeningKind={setOpeningKind}
          openingAmount={openingAmount}
          setOpeningAmount={setOpeningAmount}
          role={role}
          setRole={setRole}
          autoFocusName
        />
    </BottomSheet>
  )
}

export default function PeoplePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <PeoplePageInner />
    </Suspense>
  )
}
