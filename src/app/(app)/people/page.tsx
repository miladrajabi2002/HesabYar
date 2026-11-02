"use client"

/**
 * لیست اشخاص — مشتری/تأمین‌کننده با تراز طلب/بدهی + افزودن سریع
 */
import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
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
} from "lucide-react"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatTomanCompact } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { RoleAvatar } from "@/components/ui/role-avatar"
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

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "مشتری",
  SUPPLIER: "فروشنده",
  BOTH: "مشتری و فروشنده",
}

function PeoplePageInner() {
  const searchParams = useSearchParams()
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

  const totalReceivable = people.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const totalPayable = -people.reduce((s, p) => s + Math.min(0, p.balance), 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">اشخاص</h1>
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

      {/* خلاصه طلب/بدهی */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-warning/25 bg-warning/10 p-3.5">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-warning">
            <HandCoins className="size-3.5" />
            جمع طلب از مشتریان
          </div>
          <p className="nums mt-1 text-base font-extrabold text-warning sm:text-lg">
            {formatTomanCompact(totalReceivable)}
          </p>
        </div>
        <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-3.5">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-destructive">
            <Building2 className="size-3.5" />
            جمع بدهی به تأمین‌کنندگان
          </div>
          <p className="nums mt-1 text-base font-extrabold text-destructive sm:text-lg">
            {formatTomanCompact(totalPayable)}
          </p>
        </div>
      </div>

      {/* فیلترها */}
      <div className="mb-4 space-y-2.5">
        <div className="relative">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام، موبایل، شرکت یا آدرس…"
            className="field ps-10"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "ALL", label: "همه" },
              { key: "CUSTOMER", label: "مشتری‌ها" },
              { key: "SUPPLIER", label: "فروشنده‌ها" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRole(f.key)}
              className={cn(
                "flex-1 rounded-2xl border py-2 text-xs font-bold transition-all",
                role === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "all", label: "بدون فیلتر" },
              { key: "debtors", label: "طلبکاران" },
              { key: "creditors", label: "بستانکاران" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setBalanceFilter(f.key)}
              className={cn(
                "flex-1 rounded-2xl border py-2 text-xs font-bold transition-all",
                balanceFilter === f.key
                  ? f.key === "debtors"
                    ? "border-warning bg-warning/10 text-warning"
                    : f.key === "creditors"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* لیست */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : people.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">شخصی ثبت نشده</p>
          <p className="mt-1 text-xs text-muted-foreground">
            هنگام ثبت فاکتور هم می‌توانید سریع شخص اضافه کنید
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="block rounded-3xl border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-card-hover active:scale-[0.995]"
            >
              <div className="flex items-center gap-3">
                <RoleAvatar role={p.role} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{p.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                    <span className="rounded-md bg-muted px-1.5 py-px font-medium">
                      {ROLE_LABEL[p.role] ?? "—"}
                    </span>
                    {p.company && <span className="truncate">{p.company}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  {p.balance !== 0 ? (
                    <>
                      <div
                        className={cn(
                          "nums text-sm font-extrabold",
                          p.balance > 0 ? "text-warning" : "text-destructive"
                        )}
                      >
                        {formatTomanCompact(Math.abs(p.balance))}
                      </div>
                      <div
                        className={cn(
                          "text-[0.6rem] font-bold",
                          p.balance > 0 ? "text-warning" : "text-destructive"
                        )}
                      >
                        {p.balance > 0 ? "طلب ما" : "بدهی ما"}
                      </div>
                    </>
                  ) : (
                    <span className="text-[0.65rem] text-muted-foreground">تسویه ✓</span>
                  )}
                </div>
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground/50" />
              </div>
            </Link>
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
