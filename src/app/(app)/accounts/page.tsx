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
import { formatToman, toPersianDigits } from "@/lib/money"
import { BANKS, getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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
  const [accountNumber, setAccountNumber] = useState(editing?.accountNumber ?? "")
  const [cardNumber, setCardNumber] = useState(editing?.cardNumber ?? "")
  const [initialBalance, setInitialBalance] = useState(editing?.initialBalance ?? 0)
  const [bankSheet, setBankSheet] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام حساب را وارد کنید")
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/accounts/${editing.id}`, {
          name: name.trim(),
          bankKey,
          accountNumber: accountNumber || undefined,
          cardNumber: cardNumber || undefined,
          initialBalance,
        })
        toast.success("حساب ویرایش شد ✅")
      } else {
        await apiPost("/api/accounts", {
          name: name.trim(),
          bankKey,
          accountNumber: accountNumber || undefined,
          cardNumber: cardNumber || undefined,
          initialBalance,
        })
        toast.success("حساب اضافه شد ✅")
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              شماره حساب
            </label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              className="field nums text-end"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              شماره کارت
            </label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              placeholder="۶۲۸۰…"
              className="field nums text-end"
            />
          </div>
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
      toast.success("انتقال انجام شد ✅")
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
    if (!confirm(`حساب «${a.name}» بایگانی شود؟ از لیست حذف می‌شود ولی تاریخچه می‌ماند.`)) return
    try {
      await apiPatch(`/api/accounts/${a.id}`, { isArchived: true })
      toast.success("بایگانی شد")
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا")
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">حساب‌های بانکی</h1>
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

      {/* جمع موجودی */}
      <div className="mb-4 rounded-3xl bg-gradient-to-l from-primary to-[#0a6353] p-4 text-white shadow-card sm:p-5">
        <p className="text-xs opacity-80">جمع موجودی همه حساب‌ها</p>
        <p className="nums mt-1 text-2xl font-extrabold sm:text-3xl">{formatToman(total, false)}</p>
        <p className="text-[0.65rem] opacity-75">تومان — در {toPersianDigits(accounts.length)} حساب</p>
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
        <div className="space-y-3">
          {accounts.map((a) => {
            const bank = getBank(a.bankKey)
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
              >
                <div className="flex items-center gap-3 p-4">
                  <BankLogo bankKey={a.bankKey} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{a.name}</div>
                    <div className="text-[0.65rem]" style={{ color: bank.color }}>
                      {bank.name}
                      {a.accountNumber ? ` • ${toPersianDigits(a.accountNumber)}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="nums text-sm font-extrabold">{formatToman(a.balance, false)}</div>
                    <div className="text-[0.6rem] text-muted-foreground">تومان</div>
                  </div>
                </div>
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
            <div className="space-y-2">
              {accounts.map((a) => (
                <SheetOption
                  key={a.id}
                  icon={<BankLogo bankKey={a.bankKey} size={36} showBg={false} />}
                  title={a.name}
                  subtitle={`مانده ${formatToman(a.balance, false)}`}
                  selected={fromId === a.id}
                  onClick={() => setFromId(a.id)}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">به حساب</label>
            <div className="space-y-2">
              {accounts.map((a) => (
                <SheetOption
                  key={a.id}
                  icon={<BankLogo bankKey={a.bankKey} size={36} showBg={false} />}
                  title={a.name}
                  subtitle={`مانده ${formatToman(a.balance, false)}`}
                  selected={toId === a.id}
                  onClick={() => setToId(a.id)}
                />
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
