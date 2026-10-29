"use client"

/**
 * جزئیات فاکتور — اقلام، پرداخت‌ها، چک‌ها + تسویه مانده + چاپ + حذف
 */
import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowRight,
  ShoppingBag,
  Package,
  Printer,
  Trash2,
  HandCoins,
  CheckSquare2,
  Banknote,
  FileText,
  Loader2,
} from "lucide-react"
import { apiDelete, apiGet, apiPost } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField, todayKey } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Invoice {
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
  person: { id: string; name: string; phone: string | null; company: string | null }
  account: { id: string; name: string; bankKey: string } | null
  items: {
    id: string
    productName: string
    brand: string | null
    code: string | null
    unit: string
    quantity: number
    unitPrice: number
    total: number
  }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    dueDate: string
    status: string
  }[]
  settlements: { id: string; amount: number; method: string; direction: string; date: string }[]
}

interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiGet<{ invoice: Invoice }>(`/api/invoices/${id}`),
  })

  const [settleSheet, setSettleSheet] = useState(false)
  const [settleAmount, setSettleAmount] = useState(0)
  const [settleMethod, setSettleMethod] = useState<"CASH" | "CHECK">("CASH")
  const [settleAccount, setSettleAccount] = useState<Account | null>(null)
  const [checkAmount, setCheckAmount] = useState(0)
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

  const inv = data.invoice
  const isSale = inv.type === "SALE"

  const settle = async () => {
    if (settleMethod === "CASH") {
      if (!settleAccount) return toast.error("حساب بانکی را انتخاب کنید")
      if (settleAmount <= 0) return toast.error("مبلغ را وارد کنید")
    } else {
      if (checkAmount <= 0) return toast.error("مبلغ چک را وارد کنید")
      if (!checkDue) return toast.error("سررسید چک را انتخاب کنید")
    }
    setSaving(true)
    try {
      await apiPost("/api/settlements", {
        personId: inv.person.id,
        invoiceId: inv.id,
        direction: isSale ? "RECEIVE" : "PAY",
        method: settleMethod,
        amount: settleMethod === "CASH" ? settleAmount : checkAmount,
        accountId: settleMethod === "CASH" ? settleAccount?.id : undefined,
        check:
          settleMethod === "CHECK"
            ? { amount: checkAmount, bankKey: checkBank, serial: checkSerial || undefined, dueDate: checkDue }
            : undefined,
        note: `تسویه مانده فاکتور ${inv.number}`,
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

  const remove = async () => {
    if (!confirm(`فاکتور ${inv.number} و همه اقلام، چک‌ها و تسویه‌هایش حذف شود؟`)) return
    try {
      await apiDelete(`/api/invoices/${inv.id}`)
      toast.success("فاکتور حذف شد")
      await queryClient.invalidateQueries()
      window.location.href = "/invoices"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف ناموفق بود")
    }
  }

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/invoices"
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowRight className="size-4" />
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
            aria-label="چاپ"
          >
            <Printer className="size-4" />
          </button>
          <button
            onClick={remove}
            className="flex size-10 items-center justify-center rounded-2xl border border-destructive/30 bg-card text-destructive/80 transition-colors hover:bg-destructive/10"
            aria-label="حذف فاکتور"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* کارت اصلی */}
      <div
        className={cn(
          "overflow-hidden rounded-3xl border shadow-card",
          isSale ? "border-income/25" : "border-destructive/25"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 p-4 text-white sm:p-5",
            isSale
              ? "bg-gradient-to-l from-income to-[#0d8a4a]"
              : "bg-gradient-to-l from-destructive to-[#c73a3f]"
          )}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            {isSale ? <ShoppingBag className="size-6" /> : <Package className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.7rem] opacity-85">
              {isSale ? "فاکتور فروش" : "فاکتور خرید"} — شماره {toPersianDigits(inv.number)}
            </div>
            <p className="truncate text-base font-extrabold sm:text-lg">{inv.person.name}</p>
            <p className="nums text-[0.68rem] opacity-85">{formatJalaliWithWeekday(new Date(inv.date))}</p>
          </div>
          <div className="shrink-0 text-end">
            <div className="nums text-lg font-extrabold sm:text-xl">{formatToman(inv.total, false)}</div>
            <div className="text-[0.65rem] opacity-85">تومان</div>
          </div>
        </div>

        {/* اقلام */}
        <div className="bg-card p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <FileText className="size-4 text-primary" />
            اقلام ({toPersianDigits(inv.items.length)})
          </div>
          <div className="space-y-2">
            {inv.items.map((it) => (
              <div key={it.id} className="rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold">
                      {it.productName}
                      {it.brand ? <span className="text-muted-foreground"> — {it.brand}</span> : null}
                    </div>
                    <div className="nums mt-0.5 text-[0.65rem] text-muted-foreground">
                      {toPersianDigits(it.quantity)} {it.unit} × {formatToman(it.unitPrice, false)}
                      {it.code ? ` • کد ${it.code}` : ""}
                    </div>
                  </div>
                  <div className="nums shrink-0 text-xs font-extrabold">{formatToman(it.total, false)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* جمع‌ها */}
          <div className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>جمع اقلام</span>
              <span className="nums">{formatToman(inv.subtotal, false)}</span>
            </div>
            {inv.discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>تخفیف</span>
                <span className="nums text-destructive">−{formatToman(inv.discount, false)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-extrabold">
              <span>مبلغ نهایی</span>
              <span className="nums">{formatToman(inv.total, false)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* پرداخت‌ها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Banknote className="size-4 text-primary" />
          پرداخت‌ها
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-[0.62rem] text-muted-foreground">نقدی</p>
            <p className="nums mt-0.5 text-xs font-bold">{formatToman(inv.paidCash, false)}</p>
          </div>
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-[0.62rem] text-muted-foreground">چک</p>
            <p className="nums mt-0.5 text-xs font-bold">{formatToman(inv.paidChecks, false)}</p>
          </div>
          <div
            className={cn(
              "rounded-2xl p-3",
              inv.credit > 0 ? "bg-warning/10" : "bg-income/10"
            )}
          >
            <p className={cn("text-[0.62rem]", inv.credit > 0 ? "text-warning" : "text-income")}>
              {inv.credit > 0 ? "مانده نسیه" : "وضعیت"}
            </p>
            <p
              className={cn(
                "nums mt-0.5 text-xs font-bold",
                inv.credit > 0 ? "text-warning" : "text-income"
              )}
            >
              {inv.credit > 0 ? formatToman(inv.credit, false) : "تسویه ✓"}
            </p>
          </div>
        </div>

        {inv.account && (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2 text-xs">
            <BankLogo bankKey={inv.account.bankKey} size={28} />
            <span className="text-muted-foreground">حساب نقدی:</span>
            <span className="font-bold">{inv.account.name}</span>
          </div>
        )}

        {/* چک‌ها */}
        {inv.checks.length > 0 && (
          <div className="mt-3 space-y-2">
            {inv.checks.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5"
              >
                <BankLogo bankKey={c.bankKey} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                  <div className="nums text-[0.62rem] text-muted-foreground">
                    {getBank(c.bankKey).name} • سررسید{" "}
                    {new Date(c.dueDate).toLocaleDateString("fa-IR")}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                    c.status === "CASHED"
                      ? "bg-income/10 text-income"
                      : c.status === "PENDING"
                        ? "bg-primary/10 text-primary"
                        : c.status === "BOUNCED"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                  )}
                >
                  {c.status === "CASHED"
                    ? "وصول ✓"
                    : c.status === "PENDING"
                      ? "در جریان"
                      : c.status === "BOUNCED"
                        ? "برگشتی"
                        : "لغو"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* تسویه‌های بابت فاکتور */}
        {inv.settlements.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {inv.settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-[0.7rem]">
                <span className="text-muted-foreground">
                  تسویه {s.method === "CASH" ? "نقدی" : "چکی"} —{" "}
                  {new Date(s.date).toLocaleDateString("fa-IR")}
                </span>
                <span className="nums font-bold">{formatToman(s.amount, false)}</span>
              </div>
            ))}
          </div>
        )}

        {inv.credit > 0 && (
          <Button
            onClick={() => {
              setSettleAmount(inv.credit)
              setCheckAmount(inv.credit)
              setSettleSheet(true)
            }}
            className="mt-4 h-12 w-full rounded-2xl font-bold shadow-fab"
          >
            <HandCoins className="size-4" />
            تسویه مانده ({formatToman(inv.credit, false)} تومان)
          </Button>
        )}

        {inv.note && (
          <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-2.5 text-[0.7rem] text-muted-foreground">
            📝 {inv.note}
          </p>
        )}
      </div>

      {/* ───────── شیت تسویه مانده ───────── */}
      <BottomSheet
        open={settleSheet}
        onClose={() => setSettleSheet(false)}
        title={`تسویه مانده فاکتور ${toPersianDigits(inv.number)}`}
        description={isSale ? "از مشتری دریافت می‌کنید" : "به تأمین‌کننده پرداخت می‌کنید"}
        size="tall"
        footer={
          <Button onClick={settle} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckSquare2 className="size-4" />}
            ثبت تسویه
          </Button>
        }
      >
        <div className="space-y-3">
          {/* روش */}
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
                onClick={() => setSettleMethod(m.key)}
                className={cn(
                  "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                  settleMethod === m.key ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {settleMethod === "CASH" ? (
            <>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  مبلغ (تومان)
                </label>
                <AmountInput value={settleAmount} onChange={setSettleAmount} showWords={false} />
                {inv.credit > 0 && (
                  <button
                    type="button"
                    onClick={() => setSettleAmount(inv.credit)}
                    className="mt-1.5 text-[0.7rem] font-medium text-primary hover:underline"
                  >
                    انتخاب کل مانده ({formatToman(inv.credit, false)})
                  </button>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  واریز/برداشت به حساب
                </label>
                <button
                  type="button"
                  onClick={() => setAccountSheet(true)}
                  className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3"
                >
                  {settleAccount ? (
                    <>
                      <BankLogo bankKey={settleAccount.bankKey} size={30} />
                      <span className="flex-1 text-start text-sm">{settleAccount.name}</span>
                    </>
                  ) : (
                    <span className="w-full text-center text-sm text-muted-foreground">انتخاب حساب…</span>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  مبلغ چک (تومان)
                </label>
                <AmountInput value={checkAmount} onChange={setCheckAmount} showWords={false} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    سریال
                  </label>
                  <input
                    value={checkSerial}
                    onChange={(e) => setCheckSerial(e.target.value)}
                    dir="ltr"
                    className="nums h-12 w-full rounded-xl border border-input bg-card px-3 text-end text-sm outline-none focus-visible:border-ring"
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
                چک تا سررسید «در جریان» می‌ماند و ربات تلگرام قبل از سررسید یادآوری می‌کند. با وصول،
                گردش بانکی ثبت می‌شود.
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
              selected={settleAccount?.id === a.id}
              onClick={() => {
                setSettleAccount(a)
                setAccountSheet(false)
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
