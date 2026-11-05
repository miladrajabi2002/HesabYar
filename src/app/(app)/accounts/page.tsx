"use client"

/**
 * حساب‌های بانکی — فقط بانک؛ لوگوی رسمی + رنگ برند خودکار + انتقال بین‌حساب
 */
import { useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Landmark,
  Plus,
  ArrowLeftRight,
  Loader2,
  Pencil,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Nfc,
  Copy,
  Trash2,
} from "lucide-react"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, toLatinDigits, toPersianDigits } from "@/lib/money"
import { BANKS, bankFromCard, getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { Select } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { showUndoToast } from "@/components/ui/undo-toast"
import { AmountInput } from "@/components/ui/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/layout/page-header"
import { formatJalaliShort } from "@/lib/jalali"
import { useConfirm } from "@/components/ui/confirm"
import { useDirty } from "@/hooks/use-dirty"
import { SettlementSheet } from "@/components/settlements/settlement-sheet"
import { TxSheet } from "@/components/accounts/tx-sheet"

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
    refId: string | null
  }[]
}

type AccountTx = Account["recent"][number]

/** شمارهٔ کارت/شبا پوشیده: «۶۱۰۴ ۳۳۷۵ •••• ۸۸۲۱» */
function maskNumber(raw: string | null): string | null {
  const d = toLatinDigits(raw ?? "").replace(/[^0-9]/g, "")
  if (d.length < 8) return null
  return toPersianDigits(`${d.slice(0, 4)} ${d.slice(4, 8)} •••• ${d.slice(-4)}`)
}

/** شمارهٔ کامل در گروه‌های چهارتایی — کارت: «۶۱۰۴ ۳۳۷۵ …»، شبا: «IR12 3456 …» */
function groupNumber(raw: string | null): string | null {
  const v = toLatinDigits(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "")
  if (!v) return null
  return toPersianDigits(v.replace(/(.{4})(?=.)/g, "$1 "))
}

/** رو‌ی کارت بانکی به رنگ بانک — در فهرست حساب‌ها (دکمه) و بالای کشوی جزئیات (نمایشی) */
function BankCardFace({ account: a, onClick }: { account: Account; onClick?: () => void }) {
  const bank = getBank(a.bankKey)
  const masked = maskNumber(a.cardNumber) ?? maskNumber(a.accountNumber)
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-label": `${a.name} — جزئیات` } : {})}
      className={cn(
        "relative isolate flex aspect-[1.586/1] flex-col overflow-hidden rounded-3xl p-4 text-start text-white",
        onClick &&
          "w-[84%] max-w-[22rem] shrink-0 snap-start transition-[filter] hover:brightness-105 sm:w-[46%] lg:w-auto lg:max-w-none"
      )}
      style={{
        background: `linear-gradient(140deg, color-mix(in srgb, ${bank.color} 82%, white) 0%, ${bank.color} 48%, color-mix(in srgb, ${bank.color} 68%, black) 100%)`,
        boxShadow: `0 14px 28px -16px color-mix(in srgb, ${bank.color} 70%, black)`,
      }}
    >
      {/* نقش پس‌زمینهٔ کارت بانکی: دو دایرهٔ محو */}
      <span aria-hidden className="pointer-events-none absolute -left-14 -top-24 -z-10 size-60 rounded-full bg-white/[0.08]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 -left-4 -z-10 size-60 rounded-full border-[2rem] border-white/[0.06]" />
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
          <BankLogo bankKey={a.bankKey} size={32} showBg={false} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label font-extrabold">{bank.name}</span>
          <span className="block truncate text-caption text-white/75">{a.name}</span>
        </span>
        <Nfc className="size-6 shrink-0 text-white/70" strokeWidth={1.8} />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-white/70">موجودی</p>
          <p className="nums truncate text-title font-black leading-tight tracking-tight">
            {formatToman(a.balance, false)}
            <span className="ms-1 text-caption font-semibold tracking-normal text-white/70">تومان</span>
          </p>
        </div>
        {/* تراشهٔ کارت */}
        <svg viewBox="0 0 40 30" className="h-8 w-[2.6rem] shrink-0" aria-hidden>
          <defs>
            <linearGradient id={`chip-${a.id}${onClick ? "" : "-d"}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6e3a1" />
              <stop offset="0.5" stopColor="#d9b75a" />
              <stop offset="1" stopColor="#b8913a" />
            </linearGradient>
          </defs>
          <rect x="0.5" y="0.5" width="39" height="29" rx="6" fill={`url(#chip-${a.id}${onClick ? "" : "-d"})`} stroke="rgb(0 0 0 / .18)" />
          <path d="M14 0.5v29M26 0.5v29M0.5 10h13.5M26 10h13.5M0.5 20h13.5M26 20h13.5M14 15h12" stroke="rgb(90 64 10 / .45)" strokeWidth="1" fill="none" />
        </svg>
      </div>
      <p className="nums mt-2.5 truncate text-left text-body font-bold tracking-[0.14em] text-white/90" dir="ltr">
        {masked ?? "•••• •••• •••• ••••"}
      </p>
    </Tag>
  )
}

/** ردیف گردش حساب — در «گردش اخیر» صفحه و کشوی جزئیات */
function TxRow({ t, sub, onClick }: { t: AccountTx; sub: string; onClick?: () => void }) {
  const isIn = t.direction === "IN"
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          isIn ? "bg-sale/10 text-sale" : "bg-purchase/10 text-purchase"
        )}
      >
        {isIn ? <ArrowDownLeft className="size-[1.15rem]" /> : <ArrowUpRight className="size-[1.15rem]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{toPersianDigits(t.description || TX_LABEL[t.type] || t.type)}</p>
        <p className="nums truncate text-caption text-muted-foreground">{sub}</p>
      </div>
      <span dir="ltr" className={cn("nums shrink-0 text-sm font-extrabold", isIn ? "text-sale" : "text-foreground")}>
        {isIn ? "+" : "−"}
        {formatToman(t.amount, false)}
      </span>
    </button>
  )
}

/** ردیف «برچسب — مقدار» جزئیات حساب، با دکمهٔ کپی اختیاری */
function DetailRow({ label, value, copy }: { label: string; value: ReactNode; copy?: string }) {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
      <span className="shrink-0 text-label text-muted-foreground">{label}</span>
      <span className="nums ms-auto min-w-0 truncate text-sm font-bold" dir="ltr">
        {value}
      </span>
      {copy && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(copy)
              toast.success(`${label} کپی شد`)
            } catch {
              toast.error("کپی ناموفق بود")
            }
          }}
          aria-label={`کپی ${label}`}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-4" />
        </button>
      )}
    </div>
  )
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
  const [saving, setSaving] = useState(false)
  // ویرایش: «ذخیره» تا وقتی چیزی عوض نشده خاموش است
  const dirty = useDirty({ name, bankKey, shebaDigits, cardNumber, initialBalance }, editing?.id ?? null)

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
        <Button onClick={submit} disabled={saving || (!!editing && !dirty)} className="h-12 w-full rounded-2xl font-bold">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          ذخیره
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">
            نام حساب *
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً جاری ملت" />
        </div>
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">بانک *</label>
          {/* انتخاب‌گر یکدست: دسکتاپ فهرست شناور، موبایل شیت با جستجو (۳۳ بانک) */}
          <Select
            value={bankKey}
            onChange={setBankKey}
            title="انتخاب بانک"
            aria-label="بانک"
            options={BANKS.map((b) => ({
              value: b.key,
              label: b.name,
              icon: <BankLogo bankKey={b.key} size={26} />,
            }))}
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center justify-between text-label font-bold text-foreground/80">
            <span>شماره شبا</span>
            {shebaDigits.length > 0 && (
              <span
                className={cn(
                  "nums text-caption font-bold",
                  shebaDigits.length === 24 ? "text-income" : "text-muted-foreground"
                )}
              >
                {toPersianDigits(shebaDigits.length)}/۲۴
              </span>
            )}
          </label>
          {/* فیلد بزرگ شبا با پیشوند ثابت IR */}
          <div className="flex h-14 items-center gap-2 rounded-2xl border border-input bg-card px-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 hover:border-input/80">
            <span className="shrink-0 select-none rounded-lg bg-muted px-2 py-1 text-caption font-extrabold tracking-widest text-muted-foreground">
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
          <p className="mt-1 text-caption text-muted-foreground">
            شبا با IR شروع می‌شود — عدد فارسی یا انگلیسی بنویسید، خودش مرتب می‌شود
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">
            شماره کارت
          </label>
          <Input
            value={cardNumber}
            onChange={(e) => {
              setCardNumber(e.target.value)
              // بانک از شش رقم اول کارت تشخیص داده می‌شود
              const detected = bankFromCard(e.target.value)
              if (detected && detected !== bankKey) setBankKey(detected)
            }}
            dir="ltr"
            inputMode="numeric"
            placeholder="۶۲۸۰…"
            className="nums text-end"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">
            مانده اولیه حساب (تومان)
          </label>
          <AmountInput value={initialBalance} onChange={setInitialBalance} showWords={false} />
          <p className="mt-1 text-caption text-muted-foreground">
            مبلغی که موقع ساخت حساب، داخلش بود
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const [formSheet, setFormSheet] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [transferSheet, setTransferSheet] = useState(false)
  const [actionFor, setActionFor] = useState<Account | null>(null)
  const { confirm } = useConfirm()

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
        message: `حساب «${a.name}» بایگانی شد`,
        description: "گردش‌هایش حفظ می‌شود",
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

  const [txOpen, setTxOpen] = useState<(AccountTx & { accountName: string }) | null>(null)
  const [settlementId, setSettlementId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const remove = async (a: Account) => {
    const yes = await confirm({
      title: `حذف حساب «${a.name}»`,
      description: "حساب برای همیشه پاک می‌شود و برگشت ندارد",
      confirmText: "حذف حساب",
      tone: "danger",
    })
    if (!yes) return
    setDeleting(true)
    try {
      await apiDelete(`/api/accounts/${a.id}`)
      setActionFor(null)
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
      toast.success("حساب حذف شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در حذف")
    } finally {
      setDeleting(false)
    }
  }

  // گردش اخیر همهٔ حساب‌ها، جدیدترین اول
  const activity = accounts
    .flatMap((a) => a.recent.map((t) => ({ ...t, accountName: a.name })))
    .sort((x, y) => +new Date(y.date) - +new Date(x.date))
    .slice(0, 8)

  const openNew = () => {
    setEditing(null)
    setFormSheet(true)
  }

  return (
    <div>
      <PageHeader title="حساب‌های بانکی" sub={`${toPersianDigits(accounts.length)} حساب`} />

      {/* نسخهٔ ۷ (P5): جمع موجودی در سربرگ و دکمه‌های انتقال/حساب کنارش */}
      <div className="mb-3.5 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold text-muted-foreground">جمع موجودی {toPersianDigits(accounts.length)} حساب</p>
          <p className="nums truncate text-page font-black tracking-tight">
            {formatToman(total, false)}
            <span className="ms-1 text-label font-semibold tracking-normal text-muted-foreground">تومان</span>
          </p>
          {total < 0 && <p className="text-caption font-bold text-destructive">کسری — موجودی کل منفی است</p>}
        </div>
        {accounts.length >= 2 && (
          <Button variant="outline" onClick={() => setTransferSheet(true)} className="h-9 rounded-xl px-3 text-label font-bold">
            <ArrowLeftRight className="size-4" />
            انتقال
          </Button>
        )}
        <Button onClick={openNew} className="h-9 rounded-xl px-3 text-label font-bold">
          <Plus className="size-4" />
          حساب
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-2.5 overflow-hidden lg:grid lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[1.586/1] w-[84%] max-w-[22rem] shrink-0 rounded-3xl lg:w-auto lg:max-w-none" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="حساب بانکی ثبت نشده"
          description="حساب‌های بانکی‌تان را اضافه کنید تا نقدی فاکتورها و پاس چک‌ها ثبت شود."
          actionLabel="افزودن حساب"
          onAction={openNew}
        />
      ) : (
        <>
          {/* کارت هر حساب به رنگ بانک — موبایل: ردیف افقی لغزان | دسکتاپ: سه‌ستونه */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
            {accounts.map((a) => (
              <BankCardFace key={a.id} account={a} onClick={() => setActionFor(a)} />
            ))}
          </div>

          <h2 className="mx-1 mb-2 mt-5 text-label font-extrabold text-foreground/80">گردش اخیر</h2>
          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-label text-muted-foreground">هنوز گردشی ثبت نشده است</p>
            ) : (
              <div className="divide-y divide-border/70">
                {activity.map((t) => (
                  <TxRow
                    key={t.id}
                    t={t}
                    sub={`${t.accountName} | ${TX_LABEL[t.type] ?? t.type} | ${formatJalaliShort(new Date(t.date))}`}
                    onClick={() => setTxOpen(t)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* کشوی جزئیات حساب — دسکتاپ از کنار، موبایل از پایین: کارت، مشخصات، گردش، ویرایش/بایگانی/حذف */}
      <BottomSheet
        open={!!actionFor}
        onClose={() => setActionFor(null)}
        title={actionFor?.name}
        description={actionFor ? getBank(actionFor.bankKey).name : undefined}
        size="tall"
        footer={
          actionFor && (
            <div className="grid gap-2">
              <Button
                onClick={() => {
                  setEditing(actionFor)
                  setActionFor(null)
                  setFormSheet(true)
                }}
                className="h-12 w-full rounded-2xl font-bold"
              >
                <Pencil className="size-4" />
                ویرایش حساب
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const a = actionFor
                    setActionFor(null)
                    archive(a)
                  }}
                  className="h-11 rounded-2xl font-bold"
                >
                  <Archive className="size-4" />
                  بایگانی
                </Button>
                <Button
                  variant="outline"
                  disabled={actionFor.recent.length > 0 || deleting}
                  title={actionFor.recent.length > 0 ? "حساب گردش‌دار فقط بایگانی می‌شود" : undefined}
                  onClick={() => remove(actionFor)}
                  className="h-11 rounded-2xl font-bold text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  حذف
                </Button>
              </div>
              {actionFor.recent.length > 0 && (
                <p className="text-center text-caption text-muted-foreground">
                  این حساب گردش دارد؛ حذف نمی‌شود ولی بایگانی برگشت‌پذیر است
                </p>
              )}
            </div>
          )
        }
      >
        {actionFor && (
          <div className="space-y-4">
            <BankCardFace account={actionFor} />

            <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
              <DetailRow label="موجودی" value={formatToman(actionFor.balance)} />
              <DetailRow label="مانده اولیه" value={formatToman(actionFor.initialBalance)} />
              <DetailRow
                label="شماره کارت"
                value={groupNumber(actionFor.cardNumber) ?? "—"}
                copy={actionFor.cardNumber ? toLatinDigits(actionFor.cardNumber).replace(/[^0-9]/g, "") : undefined}
              />
              <DetailRow
                label="شبا"
                value={groupNumber(actionFor.accountNumber) ?? "—"}
                copy={actionFor.accountNumber ?? undefined}
              />
            </div>

            <div>
              <h3 className="mx-1 mb-2 text-label font-extrabold text-foreground/80">گردش اخیر این حساب</h3>
              <div className="overflow-hidden rounded-2xl border border-border">
                {actionFor.recent.length === 0 ? (
                  <p className="px-4 py-6 text-center text-label text-muted-foreground">هنوز گردشی ثبت نشده است</p>
                ) : (
                  <div className="divide-y divide-border/70">
                    {actionFor.recent.map((t) => (
                      <TxRow
                        key={t.id}
                        t={t}
                        sub={`${TX_LABEL[t.type] ?? t.type} | ${formatJalaliShort(new Date(t.date))}`}
                        onClick={() => setTxOpen({ ...t, accountName: actionFor.name })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

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

      {/* جزئیات یک گردش: تسویه نقدی → ویرایش/حذف تسویه · انتقال → حذف · فاکتور/چک → لینک به مبدأ */}
      <TxSheet
        tx={txOpen}
        onClose={() => setTxOpen(null)}
        onOpenSettlement={(sid) => {
          setTxOpen(null)
          setSettlementId(sid)
        }}
        onDeleted={async () => {
          setTxOpen(null)
          await queryClient.invalidateQueries()
        }}
      />
      <SettlementSheet settlementId={settlementId} onClose={() => setSettlementId(null)} />

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
            <label className="mb-1.5 block text-label font-bold text-foreground/80">از حساب</label>
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
                    <span className="nums block truncate text-caption text-muted-foreground">{formatToman(a.balance, false)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-label font-bold text-foreground/80">به حساب</label>
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
                    <span className="nums block truncate text-caption text-muted-foreground">{formatToman(a.balance, false)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-label font-bold text-foreground/80">مبلغ (تومان)</label>
            <AmountInput value={transferAmount} onChange={setTransferAmount} showWords={false} />
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
