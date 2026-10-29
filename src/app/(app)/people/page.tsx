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
} from "lucide-react"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatTomanCompact } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  SUPPLIER: "تأمین‌کننده",
  BOTH: "مشتری و تأمین‌کننده",
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
        <Button onClick={() => setAddSheet(true)} className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab">
          <Plus className="size-4" />
          شخص جدید
        </Button>
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
            className="h-11 w-full rounded-2xl border border-input bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "ALL", label: "همه" },
              { key: "CUSTOMER", label: "مشتری‌ها" },
              { key: "SUPPLIER", label: "تأمین‌کننده‌ها" },
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
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold",
                    p.role === "SUPPLIER" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  )}
                >
                  {p.name.trim().charAt(0)}
                </span>
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
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    setSaving(true)
    try {
      const r = await apiPost<{ person: Person }>("/api/people", {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role,
      })
      toast.success("شخص ثبت شد ✅")
      setName("")
      setPhone("")
      setCompany("")
      setShopAddress("")
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
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09…"
            className="nums h-10 w-full rounded-xl border border-input bg-card px-3 text-end text-sm outline-none focus-visible:border-ring"
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
                { key: "SUPPLIER", label: "تأمین‌کننده" },
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
                ) : (
                  <Building2 className="size-3.5" />
                )}
                {r.label}
              </button>
            ))}
          </div>
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
