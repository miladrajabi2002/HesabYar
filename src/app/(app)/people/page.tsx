"use client"

/**
 * لیست اشخاص — مشتری/تأمین‌کننده با تراز طلب/بدهی + افزودن سریع
 */
import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import { formatTomanCompact, toLatinDigits } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { BalanceAvatar, RoleBadge } from "@/components/ui/role-avatar"
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
}

function PeoplePageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [role, setRole] = useState<"ALL" | "CUSTOMER" | "SUPPLIER">("ALL")
  const [balanceFilter, setBalanceFilter] = useState<"all" | "debtors" | "creditors">(() => {
    const f = searchParams.get("filter")
    return f === "debtors" || f === "creditors" ? f : "all"
  })
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
  if (q) params.set("q", q)

  const { data, isLoading } = useQuery({
    queryKey: ["people", role, q],
    queryFn: () => apiGet<{ people: Person[] }>(`/api/people?${params}`),
  })

  let people = data?.people ?? []
  if (balanceFilter === "debtors") people = people.filter((p) => p.balance > 0)
  if (balanceFilter === "creditors") people = people.filter((p) => p.balance < 0)
  const maxAbsBalance = Math.max(0, ...(data?.people ?? []).map((p) => Math.abs(p.balance)))

  const totalReceivable = people.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const totalPayable = -people.reduce((s, p) => s + Math.min(0, p.balance), 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="hidden text-lg font-extrabold lg:block lg:text-xl">اشخاص</h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => downloadCsv("people")}
            variant="outline"
            disabled={exporting}
            className="h-10 rounded-2xl px-4 text-xs font-bold hover:bg-accent"
            aria-label="خروجی اکسل اشخاص"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">اکسل</span>
          </Button>
          <Button onClick={() => setAddSheet(true)} className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab">
            <Plus className="size-4" />
            شخص جدید
          </Button>
        </div>
      </div>

      {/* خلاصه طلب/بدهی — لمس = فیلتر */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {(
          [
            { key: "debtors", label: "طلب ما از اشخاص", value: totalReceivable, tone: "var(--warning)", icon: HandCoins },
            { key: "creditors", label: "بدهی ما به اشخاص", value: totalPayable, tone: "var(--role-supplier)", icon: Building2 },
          ] as const
        ).map((c, i) => (
          <motion.button
            key={c.key}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: "spring", stiffness: 380, damping: 30 }}
            onClick={() => setBalanceFilter(balanceFilter === c.key ? "all" : c.key)}
            style={{ ["--tile" as string]: c.tone }}
            className={cn(
              "relative overflow-hidden rounded-3xl border bg-card p-3.5 text-start shadow-card transition-all active:scale-[0.98]",
              balanceFilter === c.key
                ? "border-[color:var(--tile)] ring-2 ring-[color:color-mix(in_srgb,var(--tile)_18%,transparent)]"
                : "border-border/70"
            )}
          >
            <div className="flex items-center gap-2 text-[0.68rem] font-bold text-muted-foreground">
              <span className="icon-soft grid size-6 place-items-center rounded-lg">
                <c.icon className="size-3.5" />
              </span>
              {c.label}
            </div>
            <p className="nums mt-2 text-base font-extrabold sm:text-lg" style={{ color: "color-mix(in srgb, var(--tile) 82%, black)" }}>
              {formatTomanCompact(c.value)}
            </p>
            <div className="mt-0.5 text-[0.6rem] text-muted-foreground">
              {balanceFilter === c.key ? "فیلتر فعال — لمس برای حذف" : "لمس برای دیدن فهرست"}
            </div>
          </motion.button>
        ))}
      </div>

      {/* فیلترها */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام، موبایل، شرکت یا آدرس…"
            className="field ps-10"
          />
        </div>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { key: "ALL", label: "همه" },
            { key: "CUSTOMER", label: "مشتری‌ها", tone: "var(--role-customer)" },
            { key: "SUPPLIER", label: "فروشنده‌ها", tone: "var(--role-supplier)" },
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
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[0.68rem] font-bold text-background"
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
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">{q || role !== "ALL" || balanceFilter !== "all" ? "کسی با این فیلتر نیست" : "شخصی ثبت نشده"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            هنگام ثبت فاکتور هم می‌توانید سریع شخص اضافه کنید
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {people.map((p, i) => (
            <motion.div
              key={p.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), type: "spring", stiffness: 380, damping: 32 }}
            >
              <SwipeRow
                hint={i === 0}
                trailing={[
                  {
                    key: "settle",
                    label: p.balance < 0 ? "پرداخت" : "دریافت",
                    icon: <HandCoins className="size-4" />,
                    color: p.balance < 0 ? "var(--role-supplier)" : "var(--warning)",
                    onAction: () => router.push(`/people/${p.id}?settle=${p.balance < 0 ? "PAY" : "RECEIVE"}`),
                  },
                ]}
                leading={
                  p.phone
                    ? [
                        {
                          key: "call",
                          label: "تماس",
                          icon: <Phone className="size-4" />,
                          color: "var(--sale)",
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
                  className="group block rounded-3xl border border-border/70 bg-card p-3.5 shadow-card transition-shadow hover:shadow-card-hover active:bg-accent/30"
                >
                  <div className="flex items-center gap-3">
                    <BalanceAvatar role={p.role} balance={p.balance} maxAbs={maxAbsBalance} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold">{p.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                        <RoleBadge role={p.role} />
                        {p.company && <span className="truncate">{p.company}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      {p.balance !== 0 ? (
                        <>
                          <div
                            className="nums text-sm font-extrabold"
                            style={{
                              color: `color-mix(in srgb, ${p.balance > 0 ? "var(--warning)" : "var(--role-supplier)"} 85%, black)`,
                            }}
                          >
                            {formatTomanCompact(Math.abs(p.balance))}
                          </div>
                          <div className="mt-0.5 text-[0.6rem] font-bold text-muted-foreground">
                            {p.balance > 0 ? "طلب ما" : "بدهی ما"}
                          </div>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-income/10 px-2 py-0.5 text-[0.6rem] font-bold text-income">
                          تسویه ✓
                        </span>
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
          ذخیره
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نام *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً آهنگری رحیمی" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            شماره موبایل (اختیاری)
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09…"
            className="nums text-end"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            اسم شرکت (اختیاری)
          </label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="مثلاً فنی قلندری" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            آدرس مغازه (اختیاری)
          </label>
          <Input
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="مثلاً بازار آهن، پلاک ۴۵"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نقش</label>
          <div className="flex gap-1.5">
            {(
              [
                { key: "CUSTOMER", label: "مشتری" },
                { key: "SUPPLIER", label: "فروشنده" },
                { key: "BOTH", label: "هردو" },
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-xl border py-2 text-xs font-bold transition-colors",
                  role === r.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {r.key === "CUSTOMER" ? (
                  <UserRound className="size-3.5" />
                ) : r.key === "SUPPLIER" ? (
                  <Building2 className="size-3.5" />
                ) : (
                  <UserRound className="size-3.5" />
                )}
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {/* ── مانده اولیه (حساب قدیمی) ── */}
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            مانده اولیه (حساب قبلی)
          </label>
          <div className="flex gap-1.5">
            {(
              [
                { key: "none", label: "بدون مانده" },
                { key: "receivable", label: "طلب اولیه" },
                { key: "payable", label: "بدهی اولیه" },
              ] as const
            ).map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setOpeningKind(k.key)}
                className={cn(
                  "flex-1 rounded-xl border py-2 text-[0.7rem] font-bold transition-colors",
                  openingKind === k.key
                    ? k.key === "receivable"
                      ? "border-warning bg-warning/10 text-warning"
                      : k.key === "payable"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          {openingKind !== "none" && (
            <div className="mt-2">
              <AmountInput value={openingAmount} onChange={setOpeningAmount} showWords={false} />
              <p className="mt-1 text-[0.62rem] text-muted-foreground">
                {openingKind === "receivable"
                  ? "این شخص از قبل به شما بدهکار است (طلب شما)"
                  : "شما از قبل به این شخص بدهکار هستید"} — در تراز شخص لحاظ می‌شود
              </p>
            </div>
          )}
        </div>
      </div>
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
