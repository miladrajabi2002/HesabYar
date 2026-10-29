"use client"

/**
 * پروفایل شخص — مشخصات، تراز، فاکتورها، چک‌ها، تسویه‌ها + ثبت تسویه
 */
import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  HandCoins,
  FileText,
  CheckSquare2,
  Phone,
  Building2,
  MapPin,
  Loader2,
  CheckCheck,
} from "lucide-react"
import { apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PersonDetail {
  person: {
    id: string
    name: string
    phone: string | null
    company: string | null
    shopAddress: string | null
    role: string
    note: string | null
  }
  balance: number
  invoices: {
    id: string
    number: number
    type: string
    date: string
    total: number
    credit: number
    status: string
  }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    dueDate: string
    status: string
    direction: string
  }[]
  settlements: {
    id: string
    direction: string
    method: string
    amount: number
    date: string
    note: string | null
  }[]
}

interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => apiGet<PersonDetail>(`/api/people/${id}`),
  })

  // شیت ویرایش
  const [editSheet, setEditSheet] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [shopAddress, setShopAddress] = useState("")
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH">("BOTH")
  const [savingEdit, setSavingEdit] = useState(false)

  // شیت تسویه
  const [settleSheet, setSettleSheet] = useState(false)
  const [direction, setDirection] = useState<"RECEIVE" | "PAY">("RECEIVE")
  const [method, setMethod] = useState<"CASH" | "CHECK">("CASH")
  const [amount, setAmount] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [checkBank, setCheckBank] = useState("mellat")
  const [checkSerial, setCheckSerial] = useState("")
  const [checkDue, setCheckDue] = useState("")
  const [accountSheet, setAccountSheet] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
    enabled: settleSheet,
  })

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const p = data.person
  const balance = data.balance

  const openEdit = () => {
    setName(p.name)
    setPhone(p.phone ?? "")
    setCompany(p.company ?? "")
    setShopAddress(p.shopAddress ?? "")
    setRole((p.role as "CUSTOMER") ?? "BOTH")
    setEditSheet(true)
  }

  const saveEdit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    setSavingEdit(true)
    try {
      await apiPatch(`/api/people/${id}`, {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role,
      })
      toast.success("ذخیره شد ✅")
      setEditSheet(false)
      await queryClient.invalidateQueries({ queryKey: ["person", id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSavingEdit(false)
    }
  }

  const openSettle = (dir: "RECEIVE" | "PAY") => {
    setDirection(dir)
    setMethod("CASH")
    setAmount(0)
    setAccount(null)
    setCheckSerial("")
    setCheckDue("")
    setSettleSheet(true)
  }

  const settle = async () => {
    if (method === "CASH") {
      if (!account) return toast.error("حساب بانکی را انتخاب کنید")
      if (amount <= 0) return toast.error("مبلغ را وارد کنید")
    } else {
      if (amount <= 0) return toast.error("مبلغ چک را وارد کنید")
      if (!checkDue) return toast.error("سررسید چک را انتخاب کنید")
    }
    setSaving(true)
    try {
      await apiPost("/api/settlements", {
        personId: id,
        direction,
        method,
        amount,
        accountId: method === "CASH" ? account?.id : undefined,
        check:
          method === "CHECK"
            ? { amount, bankKey: checkBank, serial: checkSerial || undefined, dueDate: checkDue }
            : undefined,
        note: "تسویه از پروفایل شخص",
      })
      toast.success("تسویه ثبت شد ✅")
      setSettleSheet(false)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت تسویه")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/people")}
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          onClick={openEdit}
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="ویرایش"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {/* کارت شخص */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-extrabold text-primary">
            {p.name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold sm:text-lg">{p.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[0.65rem] text-muted-foreground">
              <span className="rounded-md bg-muted px-1.5 py-px font-medium">
                {p.role === "CUSTOMER" ? "مشتری" : p.role === "SUPPLIER" ? "تأمین‌کننده" : "مشتری و تأمین‌کننده"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          {p.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5" />
              <span className="nums">{p.phone}</span>
            </div>
          )}
          {p.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="size-3.5" />
              {p.company}
            </div>
          )}
          {p.shopAddress && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-3.5" />
              {p.shopAddress}
            </div>
          )}
        </div>

        {/* تراز */}
        <div
          className={cn(
            "mt-4 flex items-center justify-between rounded-2xl px-4 py-3",
            balance > 0
              ? "bg-warning/10"
              : balance < 0
                ? "bg-destructive/10"
                : "bg-income/10"
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              balance > 0 ? "text-warning" : balance < 0 ? "text-destructive" : "text-income"
            )}
          >
            {balance > 0 ? "طلب ما از این شخص" : balance < 0 ? "بدهی ما به این شخص" : "تسویه کامل ✓"}
          </span>
          <span
            className={cn(
              "nums text-base font-extrabold",
              balance > 0 ? "text-warning" : balance < 0 ? "text-destructive" : "text-income"
            )}
          >
            {balance !== 0 ? formatToman(Math.abs(balance), false) : "—"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={() => openSettle("RECEIVE")}
            variant="outline"
            className="h-11 rounded-2xl border-warning/40 text-xs font-bold text-warning hover:bg-warning/10"
          >
            <HandCoins className="size-4" />
            دریافت از شخص
          </Button>
          <Button
            onClick={() => openSettle("PAY")}
            variant="outline"
            className="h-11 rounded-2xl border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/10"
          >
            <HandCoins className="size-4" />
            پرداخت به شخص
          </Button>
        </div>
      </div>

      {/* فاکتورها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <FileText className="size-4 text-primary" />
          فاکتورها ({toPersianDigits(data.invoices.length)})
        </div>
        <div className="space-y-2">
          {data.invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                )}
              >
                {inv.type === "SALE" ? (
                  <ArrowUpRight className="size-4" strokeWidth={2.3} />
                ) : (
                  <ArrowDownLeft className="size-4" strokeWidth={2.3} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">
                  {inv.type === "SALE" ? "فروش" : "خرید"} شماره {toPersianDigits(inv.number)}
                </div>
                <div className="nums text-[0.62rem] text-muted-foreground">
                  {formatJalaliShort(new Date(inv.date))}
                </div>
              </div>
              <div className="shrink-0 text-end">
                <div className="nums text-xs font-extrabold">{formatToman(inv.total, false)}</div>
                {inv.credit > 0 && (
                  <div className="nums text-[0.6rem] font-bold text-warning">
                    مانده {formatTomanCompact(inv.credit)}
                  </div>
                )}
              </div>
            </Link>
          ))}
          {data.invoices.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">فاکتوری ثبت نشده</p>
          )}
        </div>
      </div>

      {/* چک‌ها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CheckSquare2 className="size-4 text-primary" />
          چک‌ها ({toPersianDigits(data.checks.length)})
        </div>
        <div className="space-y-2">
          {data.checks.map((c) => (
            <Link
              key={c.id}
              href="/checks"
              className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <BankLogo bankKey={c.bankKey} size={34} />
              <div className="min-w-0 flex-1">
                <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                <div className="nums text-[0.62rem] text-muted-foreground">
                  {getBank(c.bankKey).name} • سررسید {formatJalaliShort(new Date(c.dueDate))}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                  c.status === "CASHED"
                    ? "bg-income/10 text-income"
                    : c.status === "PENDING"
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                )}
              >
                {c.status === "CASHED" ? "پاس ✓" : c.status === "PENDING" ? "در جریان" : c.status === "BOUNCED" ? "برگشت خورده" : "لغو"}
              </span>
            </Link>
          ))}
          {data.checks.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">چکی ثبت نشده</p>
          )}
        </div>
      </div>

      {/* تسویه‌ها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CheckCheck className="size-4 text-primary" />
          تاریخچه تسویه‌ها
        </div>
        <div className="space-y-1.5">
          {data.settlements.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs"
            >
              <div>
                <span className={cn("font-bold", s.direction === "RECEIVE" ? "text-income" : "text-destructive")}>
                  {s.direction === "RECEIVE" ? "دریافت" : "پرداخت"} {s.method === "CASH" ? "نقدی" : "چکی"}
                </span>
                <span className="nums ms-2 text-[0.62rem] text-muted-foreground">
                  {formatJalaliShort(new Date(s.date))}
                </span>
              </div>
              <span className="nums font-extrabold">{formatToman(s.amount, false)}</span>
            </div>
          ))}
          {data.settlements.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">تسویه‌ای ثبت نشده</p>
          )}
        </div>
      </div>

      {/* ───────── شیت ویرایش ───────── */}
      <BottomSheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        title="ویرایش شخص"
        size="tall"
        footer={
          <Button onClick={saveEdit} disabled={savingEdit} className="h-12 w-full rounded-2xl font-bold">
            {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            ذخیره تغییرات
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نام *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">موبایل</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              className="field nums text-end"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">شرکت</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">آدرس مغازه</label>
            <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
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
                    "flex-1 rounded-xl border py-2 text-xs font-bold transition-colors",
                    role === r.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* ───────── شیت تسویه ───────── */}
      <BottomSheet
        open={settleSheet}
        onClose={() => setSettleSheet(false)}
        title={direction === "RECEIVE" ? "دریافت از شخص" : "پرداخت به شخص"}
        description={p.name}
        size="tall"
        footer={
          <Button onClick={settle} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            ثبت تسویه
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex rounded-2xl bg-muted p-1">
            {(
              [
                { key: "CASH", label: "نقدی" },
                { key: "CHECK", label: "چک" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={cn(
                  "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                  method === m.key ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              مبلغ (تومان) *
            </label>
            <AmountInput
              value={amount}
              onChange={setAmount}
              showWords={false}
            />
            {balance !== 0 && amount === 0 && (
              <button
                type="button"
                onClick={() => setAmount(Math.abs(balance))}
                className="mt-1.5 text-[0.7rem] font-medium text-primary hover:underline"
              >
                انتخاب کل تراز ({formatToman(Math.abs(balance), false)})
              </button>
            )}
          </div>

          {method === "CASH" ? (
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                حساب بانکی
              </label>
              <button
                type="button"
                onClick={() => setAccountSheet(true)}
                className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
              >
                {account ? (
                  <>
                    <BankLogo bankKey={account.bankKey} size={30} />
                    <span className="flex-1 text-start text-sm">{account.name}</span>
                  </>
                ) : (
                  <span className="w-full text-center text-sm text-muted-foreground">انتخاب حساب…</span>
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">سریال</label>
                  <input
                    value={checkSerial}
                    onChange={(e) => setCheckSerial(e.target.value)}
                    dir="ltr"
                    className="field nums text-end"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    سررسید *
                  </label>
                  <JalaliDateField value={checkDue} onChange={setCheckDue} />
                </div>
              </div>
              <p className="rounded-xl bg-primary/5 px-3 py-2 text-[0.65rem] text-muted-foreground">
                چک دریافت‌شده از مشتری یا داده‌شده به تأمین‌کننده؛ ربات تلگرام قبل از سررسید خبر می‌دهد.
              </p>
            </>
          )}
        </div>
      </BottomSheet>

      {/* شیت حساب */}
      <BottomSheet open={accountSheet} onClose={() => setAccountSheet(false)} title="انتخاب حساب بانکی">
        <div className="space-y-2">
          {(accountsData?.accounts ?? []).map((a) => (
            <SheetOption
              key={a.id}
              icon={<BankLogo bankKey={a.bankKey} size={40} showBg={false} />}
              title={a.name}
              subtitle={`${getBank(a.bankKey).name} • مانده ${formatToman(a.balance, false)}`}
              selected={account?.id === a.id}
              onClick={() => {
                setAccount(a)
                setAccountSheet(false)
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
