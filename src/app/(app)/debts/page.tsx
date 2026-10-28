"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Plus, HandCoins, Pencil, Trash2, CheckCircle2, CalendarClock, Loader2, AlertTriangle } from "lucide-react"
import { apiGet, apiDelete, apiPost, apiPatch } from "@/lib/api-client"
import type { DebtDTO, AccountDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { CountUp } from "@/components/shared/count-up"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriceInput } from "@/components/ui/price-input"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalali, diffJalaliDays, nowTehran } from "@/lib/jalali"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export default function DebtsPage() {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [formOpen, setFormOpen] = useState<"I_OWE" | "OWED_TO_ME" | null>(null)
  const [editing, setEditing] = useState<DebtDTO | null>(null)
  const [deleting, setDeleting] = useState<DebtDTO | null>(null)
  const [settling, setSettling] = useState<DebtDTO | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["debts"],
    queryFn: () => apiGet<{ debts: DebtDTO[] }>("/api/debts"),
  })
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/debts/${id}`),
    onSuccess: () => {
      toast.success("حذف شد")
      qc.invalidateQueries()
      setDeleting(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const debts = data?.debts ?? []
  const accounts = (accountsData?.accounts ?? []).filter((a) => !a.isArchived)
  const now = nowTehran()

  const renderCards = (list: DebtDTO[], direction: "I_OWE" | "OWED_TO_ME") => {
    const open = list.filter((d) => !d.isSettled)
    const settled = list.filter((d) => d.isSettled)
    const totalRemaining = open.reduce((s, d) => s + d.remaining, 0)

    if (list.length === 0) {
      return (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <HandCoins className="size-6" />
          </span>
          <h3 className="mt-4 font-bold">
            {direction === "I_OWE" ? "بدهی ثبت‌شده‌ای ندارید" : "طلبی ثبت نکرده‌اید"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {direction === "I_OWE" ? "قرض‌هایی که به دیگران دارید را اینجا ثبت کنید" : "پولی که به شما قرض داده‌اند را ثبت کنید"}
          </p>
          <Button className="mt-4 rounded-xl" onClick={() => setFormOpen(direction)}>
            {direction === "I_OWE" ? "ثبت بدهی" : "ثبت طلب"}
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {open.length > 0 ? (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 shadow-card">
            <span className="text-xs text-muted-foreground">
              {open.length > 0 ? `مانده ${toPersianDigits(open.length)} مورد` : ""}
            </span>
            <span className={cn("nums text-base font-extrabold", direction === "I_OWE" ? "text-expense" : "text-income")} dir="rtl">
              <CountUp value={totalRemaining} format={(n) => formatToman(n)} />
            </span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {open.map((d, i) => {
            const daysLeft = d.dueDate ? diffJalaliDays(now, new Date(d.dueDate)) : null
            const nearDue = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0
            const overdue = daysLeft !== null && daysLeft < 0
            const percent = d.amount > 0 ? (d.settledAmount / d.amount) * 100 : 0
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                className="group rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-11 items-center justify-center rounded-2xl text-base font-extrabold",
                        direction === "I_OWE" ? "bg-expense/10 text-expense" : "bg-income/10 text-income"
                      )}
                    >
                      {d.person.trim().charAt(0)}
                    </span>
                    <div>
                      <div className="text-sm font-bold">{d.person}</div>
                      <div className="nums text-xs text-muted-foreground">
                        {formatToman(d.remaining, false)} از {formatToman(d.amount, false)} مانده
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-lg:opacity-100">
                    <Button variant="ghost" size="icon-xs" aria-label="ویرایش" onClick={() => setEditing(d)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="حذف"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleting(d)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {d.dueDate ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="nums flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      سررسید: {formatJalali(new Date(d.dueDate))}
                    </span>
                    {nearDue ? (
                      <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                        <AlertTriangle className="size-3" />
                        {daysLeft === 0 ? "امروز" : `${toPersianDigits(daysLeft)} روز مانده`}
                      </Badge>
                    ) : overdue ? (
                      <Badge className="bg-expense/15 text-expense hover:bg-expense/15">
                        {toPersianDigits(Math.abs(daysLeft))} روز گذشته
                      </Badge>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, percent)}%` }}
                    transition={{ duration: 0.6 }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
                <div className="nums mt-1 text-[0.65rem] text-muted-foreground">
                  {toPersianDigits(Math.round(percent))}٪ تسویه شده
                </div>

                <Button
                  variant={direction === "I_OWE" ? "destructive" : "default"}
                  size="sm"
                  className="mt-3 w-full rounded-xl"
                  onClick={() => setSettling(d)}
                >
                  {direction === "I_OWE" ? "پرداخت / تسویه" : "دریافت / تسویه"}
                </Button>
              </motion.div>
            )
          })}
        </div>

        {settled.length > 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-income" />
              تسویه‌شده‌ها
            </div>
            <div className="space-y-2">
              {settled.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5">
                  <span className="text-sm font-medium">{d.person}</span>
                  <span className="nums text-xs text-muted-foreground">{formatToman(d.amount, false)} تومان</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="بدهی و طلب"
        subtitle="قرض‌های شما و پولی که به شما واگذار شده، همراه با هشدار سررسید تلگرام"
        actions={
          <Button className="rounded-xl" onClick={() => setFormOpen("I_OWE")}>
            <Plus className="size-4" />
            ثبت جدید
          </Button>
        }
      />

      <Tabs defaultValue="I_OWE" dir="rtl">
        <TabsList className="rounded-xl">
          <TabsTrigger value="I_OWE">بدهی‌های من</TabsTrigger>
          <TabsTrigger value="OWED_TO_ME">طلب‌های من</TabsTrigger>
        </TabsList>
        <TabsContent value="I_OWE" className="mt-4">
          {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : renderCards(debts.filter((d) => d.direction === "I_OWE"), "I_OWE")}
        </TabsContent>
        <TabsContent value="OWED_TO_ME" className="mt-4">
          {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : renderCards(debts.filter((d) => d.direction === "OWED_TO_ME"), "OWED_TO_ME")}
        </TabsContent>
      </Tabs>

      {/* فرم ثبت/ویرایش */}
      {(formOpen !== null || editing !== null) && (
        <DebtFormModal
          key={editing?.id ?? `new-${formOpen}`}
          direction={editing?.direction ?? formOpen ?? "I_OWE"}
          debt={editing}
          onClose={() => {
            setFormOpen(null)
            setEditing(null)
          }}
        />
      )}

      {/* تسویه */}
      {settling ? (
        <SettleDialog key={settling.id} debt={settling} accounts={accounts} onClose={() => setSettling(null)} />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف «${deleting?.person ?? ""}»`}
        description="رکورد حذف می‌شود؛ تراکنش‌های تسویه قبلی باقی می‌مانند."
        confirmText="حذف کن"
        destructive
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}

function DebtFormModal({
  direction,
  debt,
  onClose,
}: {
  direction: "I_OWE" | "OWED_TO_ME"
  debt: DebtDTO | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!debt
  const [person, setPerson] = useState(debt?.person ?? "")
  const [amount, setAmount] = useState(debt ? String(debt.amount) : "")
  const [dueDate, setDueDate] = useState<Date | null>(debt?.dueDate ? new Date(debt.dueDate) : null)
  const [note, setNote] = useState(debt?.note ?? "")

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNum = Math.round(Number(amount || "0"))
      if (!person.trim()) throw new Error("نام شخص را وارد کنید")
      if (!amountNum || amountNum <= 0) throw new Error("مبلغ را وارد کنید")
      const body = {
        direction,
        person: person.trim(),
        amount: amountNum,
        dueDate: dueDate ? dueDate.toISOString() : null,
        note: note || null,
      }
      if (isEdit) return apiPatch(`/api/debts/${debt!.id}`, body)
      return apiPost("/api/debts", body)
    },
    onSuccess: () => {
      toast.success(isEdit ? "ویرایش شد" : "ثبت شد")
      qc.invalidateQueries()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const isOwe = (debt?.direction ?? direction) === "I_OWE"

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isEdit ? "ویرایش" : "ثبت"} {isOwe ? "بدهی" : "طلب"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>نام شخص</Label>
            <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="مثلاً علی رضایی" maxLength={60} />
          </div>

          <div className="space-y-1.5">
            <Label>مبلغ کل (تومان)</Label>
            <PriceInput value={amount} onValueChange={setAmount} showWords showCurrencyToggle={false} placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label>تاریخ سررسید (اختیاری)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <JalaliDatePicker value={dueDate ?? nowTehran()} onChange={setDueDate} className="w-full" />
              </div>
              {dueDate ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDueDate(null)}>
                  حذف
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً برای تعمیر ماشین" maxLength={300} />
          </div>

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={mutation.isPending}>
            {isEdit ? "ذخیره تغییرات" : "ثبت"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SettleDialog({
  debt,
  accounts,
  onClose,
}: {
  debt: DebtDTO
  accounts: AccountDTO[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [amount, setAmount] = useState(String(debt.remaining))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [date, setDate] = useState<Date>(nowTehran())

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNum = Math.round(Number(amount || "0"))
      if (!amountNum || amountNum <= 0) throw new Error("مبلغ را وارد کنید")
      if (!accountId) throw new Error("حساب را انتخاب کنید")
      return apiPost(`/api/debts/${debt.id}/settle`, {
        amount: amountNum,
        accountId,
        date: date.toISOString(),
      })
    },
    onSuccess: () => {
      toast.success("تسویه ثبت شد و تراکنش ایجاد شد")
      haptic.success()
      qc.invalidateQueries()
      onClose()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      haptic.error()
    },
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">
            {debt.direction === "I_OWE" ? "پرداخت بدهی" : "دریافت طلب"} — {debt.person}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
            مانده فعلی: <span className="nums font-bold text-foreground">{formatToman(debt.remaining)}</span>
          </div>

          <div className="space-y-1.5">
            <Label>مبلغ {debt.direction === "I_OWE" ? "پرداختی" : "دریافتی"} (تومان)</Label>
              <PriceInput value={amount} onValueChange={setAmount} showWords showCurrencyToggle={false} placeholder="0" />
              <div className="flex gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="rounded-lg"
                  onClick={() => setAmount(String(debt.remaining))}
                >
                  تسویه کامل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="rounded-lg"
                  onClick={() => setAmount(String(Math.round(debt.remaining / 2)))}
                >
                  نصف مبلغ
                </Button>
              </div>
            </div>

          <div className="space-y-1.5">
            <Label>{debt.direction === "I_OWE" ? "پرداخت از حساب" : "واریز به حساب"}</Label>
              <Select
                value={accountId}
                onValueChange={(v) => setAccountId(v ?? "")}
                items={accounts.map((a) => ({ value: a.id, label: a.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          <div className="space-y-1.5">
            <Label>تاریخ</Label>
            <JalaliDatePicker value={date} onChange={setDate} />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            یک تراکنش واقعی ({debt.direction === "I_OWE" ? "هزینه" : "درآمد"}) در حساب انتخابی ثبت می‌شود و مانده به‌روز خواهد شد.
          </p>

          <Button
            type="submit"
            className="w-full rounded-xl"
            size="lg"
            variant={debt.direction === "I_OWE" ? "destructive" : "default"}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            ثبت تسویه
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
