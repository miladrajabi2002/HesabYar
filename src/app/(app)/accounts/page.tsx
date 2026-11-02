"use client"

/**
 * حساب‌های بانکی — فقط بانک؛ لوگوی رسمی + رنگ برند خودکار + انتقال بین‌حساب
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Landmark,
  Plus,
  ArrowLeftRight,
  Loader2,
  Pencil,
  Archive,
} from "lucide-react"
import { apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, toLatinDigits, toPersianDigits } from "@/lib/money"
import { BANKS, getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { showUndoToast } from "@/components/ui/undo-toast"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/charts/finance-charts"

interface Account {
  id: string
  name: string
  bankKey: string
  accountNumber: string | null
  cardNumber: string | null
  initialBalance: number
  balance: number
  recent: {
    id: string
    direction: string
    amount: number
    type: string
    description: string
    date: string
  }[]
}

const TX_LABEL: Record<string, string> = {
  INVOICE_CASH: "فاکتور نقدی",
  CHECK_CASHED: "پاس چک",
  SETTLEMENT_CASH: "تسویه نقدی",
  TRANSFER: "انتقال",
  OPENING: "مانده اولیه",
}

function AccountForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  editing: Account | null
}) {
  const [name, setName] = useState(editing?.name ?? "")
  const [bankKey, setBankKey] = useState(editing?.bankKey ?? "mellat")
  // فقط ارقام شبا (بدون IR) — IR پیشوند ثابت رابط کاربری است
  const [shebaDigits, setShebaDigits] = useState(() =>
    toLatinDigits((editing?.accountNumber ?? "").toUpperCase())
      .replace(/[^0-9]/g, "")
      .slice(0, 24)
  )
  const [cardNumber, setCardNumber] = useState(editing?.cardNumber ?? "")
  const [initialBalance, setInitialBalance] = useState(editing?.initialBalance ?? 0)
  const [bankSheet, setBankSheet] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام حساب را وارد کنید")
    if (shebaDigits && shebaDigits.length !== 24)
      return toast.error("شماره شبا باید بعد از IR دقیقاً ۲۴ رقم باشد")
    // همیشه مقدار می‌فرستیم تا پاک‌کردن شبا در ویرایش هم ذخیره شود
    const accountNumber = shebaDigits ? `IR${shebaDigits}` : null
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/accounts/${editing.id}`, {
          name: name.trim(),
          bankKey,
          // همیشه مقدار می‌فرستیم تا پاک‌کردن شبا/کارت در ویرایش هم ذخیره شود
          accountNumber,
          cardNumber: cardNumber || null,
          initialBalance,
        })
        toast.success("حساب ویرایش شد")
      } else {
        await apiPost("/api/accounts", {
          name: name.trim(),
          bankKey,
          accountNumber,
          cardNumber: cardNumber || undefined,
          initialBalance,
        })
        toast.success("حساب اضافه شد")
      }
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش حساب" : "حساب بانکی جدید"}
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
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            نام حساب *
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً جاری ملت" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">بانک *</label>
          <button
            type="button"
            onClick={() => setBankSheet(true)}
            className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
          >
            <BankLogo bankKey={bankKey} size={34} />
            <span className="flex-1 text-start text-sm">{getBank(bankKey).name}</span>
            <span className="text-[0.65rem] text-muted-foreground">تغییر</span>
          </button>
        </div>
        <div>
          <label className="mb-1.5 flex items-center justify-between text-[0.7rem] font-medium text-muted-foreground">
            <span>شماره شبا</span>
            {shebaDigits.length > 0 && (
              <span
                className={cn(
                  "nums text-[0.62rem] font-bold",
                  shebaDigits.length === 24 ? "text-income" : "text-muted-foreground"
                )}
              >
                {toPersianDigits(shebaDigits.length)}/۲۴
              </span>
            )}
          </label>
          {/* فیلد بزرگ شبا با پیشوند ثابت IR */}
          <div className="flex h-14 items-center gap-2 rounded-2xl border border-input bg-card px-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 hover:border-input/80">
            <span className="shrink-0 select-none rounded-lg bg-muted px-2 py-1 text-[0.72rem] font-extrabold tracking-widest text-muted-foreground">
              IR
            </span>
            <Input
              value={shebaDigits}
              onChange={(e) => {
                // ارقام فارسی/لاتین → لاتین؛ حروف و جداکننده‌ها حذف؛ حداکثر ۲۴ رقم
                const digits = toLatinDigits(e.target.value.toUpperCase())
                  .replace(/[^0-9]/g, "")
                  .slice(0, 24)
                setShebaDigits(digits)
              }}
              dir="ltr"
              inputMode="numeric"
              placeholder="۲۴ رقم شبا را وارد کنید"
              className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base font-bold tracking-wider focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <p className="mt-1 text-[0.62rem] text-muted-foreground">
            شبا با IR شروع می‌شود — عدد فارسی یا انگلیسی بنویسید، خودش مرتب می‌شود
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            شماره کارت
          </label>
          <Input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            dir="ltr"
            inputMode="numeric"
            placeholder="۶۲۸۰…"
            className="nums text-end"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            مانده اولیه حساب (تومان)
          </label>
          <AmountInput value={initialBalance} onChange={setInitialBalance} showWords={false} />
          <p className="mt-1 text-[0.62rem] text-muted-foreground">
            مبلغی که موقع ساخت حساب، داخلش بود
          </p>
        </div>
      </div>

      <BottomSheet
        open={bankSheet}
        onClose={() => setBankSheet(false)}
        title="انتخاب بانک"
        size="tall"
      >
        <div className="grid grid-cols-2 gap-2">
          {BANKS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => {
                setBankKey(b.key)
                setBankSheet(false)
              }}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2.5 text-start transition-all active:scale-[0.98]",
                bankKey === b.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:bg-accent/60"
              )}
            >
              <BankLogo bankKey={b.key} size={36} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{b.name}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </BottomSheet>
  )
}

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const [formSheet, setFormSheet] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [transferSheet, setTransferSheet] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
  })

  const accounts = data?.accounts ?? []
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  // فرم انتقال
  const [fromId, setFromId] = useState("")
  const [toId, setToId] = useState("")
  const [transferAmount, setTransferAmount] = useState(0)
  const [transferring, setTransferring] = useState(false)

  const transfer = async () => {
    if (!fromId || !toId) return toast.error("هر دو حساب را انتخاب کنید")
    if (fromId === toId) return toast.error("حساب مبدأ و مقصد یکسان است")
    if (transferAmount <= 0) return toast.error("مبلغ را وارد کنید")
    setTransferring(true)
    try {
      await apiPost("/api/accounts/transfer", {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: transferAmount,
      })
      toast.success("انتقال انجام شد")
      setTransferSheet(false)
      setFromId("")
      setToId("")
      setTransferAmount(0)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در انتقال")
    } finally {
      setTransferring(false)
    }
  }

  const archive = async (a: Account) => {
    // IMP-09: بایگانی نرم و برگشت‌پذیر است (PATCH isArchived) — بدون پنجره تأیید،
    // عملیات فوری + توست «بازگردانی» با ۵ ثانیه فرصت.
    try {
      await apiPatch(`/api/accounts/${a.id}`, { isArchived: true })
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
      showUndoToast({
        message: "حساب بایگانی شد",
        onUndo: async () => {
          try {
            await apiPatch(`/api/accounts/${a.id}`, { isArchived: false })
            await queryClient.invalidateQueries({ queryKey: ["accounts"] })
            toast.success("بازگردانی شد")
          } catch {
            toast.error("بازگردانی حساب ناموفق بود")
          }
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا")
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="hidden text-lg font-extrabold lg:block lg:text-xl">حساب‌های بانکی</h1>
        <Button
          onClick={() => {
            setEditing(null)
            setFormSheet(true)
          }}
          className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab"
        >
          <Plus className="size-4" />
          حساب جدید
        </Button>
      </div>

      {/* جمع موجودی + سهم هر حساب */}
      <div className="hero-gradient relative mb-4 overflow-hidden rounded-[1.75rem] p-5 text-white shadow-[0_20px_40px_-18px_rgba(7,74,61,0.6)] sm:p-6">
        <p className="relative text-xs font-medium opacity-80">جمع موجودی همه حساب‌ها</p>
        <p className="nums relative mt-1.5 text-[2rem] font-black leading-none tracking-tight sm:text-[2.5rem]">
          {formatToman(total, false)}
          <span className="ms-1.5 text-sm font-semibold opacity-70">تومان</span>
        </p>
        <p className="relative mt-2 text-xs opacity-80">در {toPersianDigits(accounts.length)} حساب</p>
        {accounts.length > 1 && total > 0 && (
          <div className="relative mt-4">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/15">
              {accounts
                .filter((a) => a.balance > 0)
                .map((a) => (
                  <span
                    key={a.id}
                    title={a.name}
                    className="h-full first:rounded-s-full last:rounded-e-full"
                    style={{ width: `${(a.balance / total) * 100}%`, background: getBank(a.bankKey).color, filter: "saturate(1.2) brightness(1.35)" }}
                  />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.64rem] opacity-90">
              {accounts
                .filter((a) => a.balance > 0)
                .map((a) => (
                  <span key={a.id} className="nums flex items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ background: getBank(a.bankKey).color, filter: "brightness(1.5)" }} />
                    {a.name} {toPersianDigits(Math.round((a.balance / total) * 100))}٪
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {accounts.length >= 2 && (
        <Button
          onClick={() => setTransferSheet(true)}
          variant="outline"
          className="mb-4 h-11 w-full rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
        >
          <ArrowLeftRight className="size-4" />
          انتقال بین حساب‌ها
        </Button>
      )}

      {/* لیست حساب‌ها */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <Landmark className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">حساب بانکی ثبت نشده</p>
          <p className="mt-1 text-xs text-muted-foreground">
            حساب‌های بانکی‌تان را اضافه کنید تا نقدی فاکتورها و پاس چک‌ها ثبت شود
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {accounts.map((a) => {
            const bank = getBank(a.bankKey)
            // روند مانده از روی گردش‌های اخیر (به عقب از مانده فعلی)
            const trend = (() => {
              if (a.recent.length < 2) return []
              let bal = a.balance
              const pts = [bal]
              for (const t of a.recent) {
                bal -= t.direction === "IN" ? t.amount : -t.amount
                pts.push(bal)
              }
              return pts.reverse()
            })()
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
              >
                <div className="flex items-center gap-3 p-4">
                  <BankLogo bankKey={a.bankKey} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{a.name}</div>
                    <div className="break-all text-[0.65rem]" style={{ color: bank.color }}>
                      {bank.name}
                      {a.accountNumber ? ` • ${toPersianDigits(a.accountNumber)}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="nums text-sm font-extrabold">{formatToman(a.balance, false)}</div>
                    <div className="text-[0.6rem] text-muted-foreground">تومان</div>
                  </div>
                </div>
                {trend.length > 1 && (
                  <div className="px-4 pb-2">
                    <Sparkline values={trend} color={bank.color} height={26} />
                  </div>
                )}
                {a.recent.length > 0 && (
                  <div className="border-t border-dashed px-4 py-2">
                    {a.recent.slice(0, 3).map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-1 text-[0.65rem]">
                        <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              t.direction === "IN" ? "bg-income" : "bg-destructive"
                            )}
                          />
                          <span className="truncate">
                            {TX_LABEL[t.type] ?? t.type} — {t.description}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "nums shrink-0 font-bold",
                            t.direction === "IN" ? "text-income" : "text-destructive"
                          )}
                        >
                          {t.direction === "IN" ? "+" : "−"}
                          {formatToman(t.amount, false)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex border-t border-border/60">
                  <button
                    onClick={() => {
                      setEditing(a)
                      setFormSheet(true)
                    }}
                    className="flex flex-1 items-center justify-center gap-1 py-2.5 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:bg-accent/60"
                  >
                    <Pencil className="size-3.5" />
                    ویرایش
                  </button>
                  <button
                    onClick={() => archive(a)}
                    className="flex flex-1 items-center justify-center gap-1 border-s border-border/60 py-2.5 text-[0.7rem] font-bold text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive"
                  >
                    <Archive className="size-3.5" />
                    بایگانی
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* فرم حساب */}
      {formSheet && (
        <AccountForm
          key={editing?.id ?? "new"}
          open={formSheet}
          editing={editing}
          onClose={() => {
            setFormSheet(false)
            setEditing(null)
          }}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["accounts"] })
          }}
        />
      )}

      {/* شیت انتقال */}
      <BottomSheet
        open={transferSheet}
        onClose={() => setTransferSheet(false)}
        title="انتقال بین حساب‌ها"
        size="tall"
        footer={
          <Button onClick={transfer} disabled={transferring} className="h-12 w-full rounded-2xl font-bold">
            {transferring ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
            انتقال
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">از حساب</label>
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setFromId(a.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border p-2.5 text-start transition-all active:scale-[0.98]",
                    fromId === a.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-accent/60"
                  )}
                >
                  <BankLogo bankKey={a.bankKey} size={30} showBg={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{a.name}</span>
                    <span className="nums block truncate text-[0.62rem] text-muted-foreground">{formatToman(a.balance, false)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">به حساب</label>
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setToId(a.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border p-2.5 text-start transition-all active:scale-[0.98]",
                    toId === a.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-accent/60"
                  )}
                >
                  <BankLogo bankKey={a.bankKey} size={30} showBg={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{a.name}</span>
                    <span className="nums block truncate text-[0.62rem] text-muted-foreground">{formatToman(a.balance, false)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">مبلغ (تومان)</label>
            <AmountInput value={transferAmount} onChange={setTransferAmount} showWords={false} />
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
