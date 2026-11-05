"use client"

/**
 * شیت جزئیات/ویرایش/حذف یک دریافت یا پرداخت (تسویه)
 * از «تاریخچهٔ تسویه‌ها» در پروفایل شخص و از «گردش اخیر» در صفحهٔ حساب‌ها باز می‌شود.
 * جهت و روش ثابت‌اند؛ مبلغ، تاریخ، توضیح و (برای نقدی) حساب قابل ویرایش‌اند.
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowDownLeft, ArrowUpRight, Loader2, Save, Trash2 } from "lucide-react"
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField, dayKeyOf } from "@/components/ui/jalali-date-picker"
import { Select } from "@/components/ui/select"
import { BankLogo } from "@/components/ui/bank-logo"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { useDirty } from "@/hooks/use-dirty"
import { cn } from "@/lib/utils"

interface SettlementDetail {
  id: string
  direction: string
  method: string
  amount: number
  date: string
  note: string | null
  accountId: string | null
  person: { id: string; name: string }
  invoice: { id: string; number: number; type: string } | null
}

interface SettlementResponse {
  settlement: SettlementDetail
  checks: { id: string; status: string; amount: number }[]
}

interface AccountLite {
  id: string
  name: string
  bankKey: string
}

const CHECK_STATUS: Record<string, string> = {
  PENDING: "در جریان",
  CASHED: "پاس‌شده",
  BOUNCED: "برگشتی",
  CANCELED: "لغوشده",
}

export function SettlementSheet({
  settlementId,
  onClose,
}: {
  /** شناسهٔ تسویه؛ null = بسته */
  settlementId: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const open = !!settlementId

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settlement", settlementId],
    queryFn: () => apiGet<SettlementResponse>(`/api/settlements/${settlementId}`),
    enabled: open,
    gcTime: 0,
  })
  const { data: accData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountLite[] }>("/api/accounts"),
    enabled: open,
  })

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={data ? (data.settlement.direction === "RECEIVE" ? "دریافت از شخص" : "پرداخت به شخص") : "تسویه"}
      description={data?.settlement.person.name}
      size="tall"
    >
      {isLoading || !settlementId ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : isError || !data ? (
        <p className="py-10 text-center text-label text-muted-foreground">این مورد پیدا نشد — شاید قبلاً حذف شده است</p>
      ) : (
        <SettlementForm
          key={settlementId}
          detail={data}
          accounts={accData?.accounts ?? []}
          onClose={onClose}
          onChanged={async () => {
            await queryClient.invalidateQueries()
          }}
          confirm={confirm}
        />
      )}
    </BottomSheet>
  )
}

function SettlementForm({
  detail,
  accounts,
  onClose,
  onChanged,
  confirm,
}: {
  detail: SettlementResponse
  accounts: AccountLite[]
  onClose: () => void
  onChanged: () => Promise<void>
  confirm: ReturnType<typeof useConfirm>["confirm"]
}) {
  const s = detail.settlement
  const isReceive = s.direction === "RECEIVE"
  const isCash = s.method === "CASH"
  const hasCheck = detail.checks.length > 0
  const checksLocked = hasCheck && detail.checks.some((c) => c.status !== "PENDING")
  const amountLocked = !isCash && (checksLocked || detail.checks.length > 1)

  const [amount, setAmount] = useState(s.amount)
  const [date, setDate] = useState(dayKeyOf(new Date(s.date)))
  const [accountId, setAccountId] = useState(s.accountId ?? "")
  const [note, setNote] = useState(s.note ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = useDirty({ amount, date, accountId, note }, s.id)

  const save = async () => {
    if (amount <= 0) return toast.error("مبلغ را وارد کنید")
    if (isCash && !accountId) return toast.error("حساب بانکی را انتخاب کنید")
    setSaving(true)
    try {
      await apiPatch(`/api/settlements/${s.id}`, {
        amount,
        date,
        accountId: isCash ? accountId : undefined,
        note: note.trim() || null,
      })
      toast.success("ذخیره شد")
      await onChanged()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const consequences: string[] = []
    if (isCash) consequences.push("گردش بانکی‌اش هم حذف می‌شود و موجودی حساب اصلاح می‌گردد")
    if (hasCheck) consequences.push(`چک این ${isReceive ? "دریافت" : "پرداخت"} هم حذف می‌شود`)
    if (s.invoice) consequences.push(`مانده فاکتور ${toPersianDigits(s.invoice.number)} دوباره باز می‌شود`)
    consequences.push("تراز شخص اصلاح می‌شود")
    const yes = await confirm({
      title: `حذف ${isReceive ? "دریافت" : "پرداخت"} ${formatToman(s.amount, false)} تومانی`,
      description: "این کار برگشت ندارد",
      confirmText: "حذف",
      tone: "danger",
      consequences,
    })
    if (!yes) return
    setDeleting(true)
    try {
      await apiDelete(`/api/settlements/${s.id}`)
      toast.success("حذف شد")
      await onChanged()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در حذف")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            isReceive ? "bg-sale/10 text-sale" : "bg-purchase/10 text-purchase"
          )}
        >
          {isReceive ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">
            {isReceive ? "دریافت" : "پرداخت"} {isCash ? "نقدی" : "چکی"}
          </p>
          <p className="nums truncate text-caption text-muted-foreground">
            ثبت‌شده در {formatJalaliShort(new Date(s.date))}
            {s.invoice && (
              <>
                {" | "}
                <Link href={`/invoices/${s.invoice.id}`} className="font-bold text-primary hover:underline">
                  فاکتور {toPersianDigits(s.invoice.number)}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          href={`/people/${s.person.id}`}
          className="shrink-0 rounded-xl bg-card px-2.5 py-1.5 text-caption font-bold text-primary"
        >
          {s.person.name}
        </Link>
      </div>

      <div>
        <label className="mb-1.5 block text-label font-bold text-foreground/80">مبلغ (تومان) *</label>
        <div className={cn(amountLocked && "pointer-events-none opacity-60")} aria-disabled={amountLocked}>
          <AmountInput value={amount} onChange={setAmount} showWords={false} />
        </div>
        {amountLocked && (
          <p className="mt-1.5 text-caption text-muted-foreground">
            چکِ این تسویه {CHECK_STATUS[detail.checks[0]?.status] ?? ""} است؛ مبلغ قابل تغییر نیست
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-label font-bold text-foreground/80">تاریخ</label>
        <JalaliDateField value={date} onChange={setDate} />
      </div>

      {isCash && (
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">حساب بانکی *</label>
          <Select
            value={accountId}
            onChange={setAccountId}
            title="حساب بانکی"
            placeholder="انتخاب حساب…"
            options={accounts.map((a) => ({
              value: a.id,
              label: a.name,
              icon: <BankLogo bankKey={a.bankKey} size={26} showBg={false} />,
            }))}
          />
        </div>
      )}

      {hasCheck && (
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2.5 text-label">
          <span className="text-muted-foreground">وضعیت چک: </span>
          <span className="font-bold">{CHECK_STATUS[detail.checks[0].status] ?? detail.checks[0].status}</span>{" "}
          <Link href="/checks" className="ms-2 font-bold text-primary hover:underline">
            چک‌ها
          </Link>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-label font-bold text-foreground/80">توضیح</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          className="field"
          placeholder="اختیاری"
        />
      </div>

      <div className="grid gap-2 pt-1">
        <Button
          onClick={save}
          disabled={saving || deleting || !dirty}
          className="h-12 w-full rounded-2xl font-bold"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          ذخیرهٔ تغییرات
        </Button>
        <Button
          variant="outline"
          onClick={remove}
          disabled={saving || deleting}
          className="h-11 w-full rounded-2xl font-bold text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          حذف {isReceive ? "دریافت" : "پرداخت"}
        </Button>
      </div>
    </div>
  )
}
