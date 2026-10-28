"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Plus, Repeat, Pencil, Trash2, Play, Loader2, History, ChevronDown } from "lucide-react"
import { apiGet, apiDelete, apiPost, apiPatch } from "@/lib/api-client"
import type { RecurringDTO, AccountDTO, CategoryDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EntityIcon, AmountText } from "@/components/shared/money-display"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriceInput } from "@/components/ui/price-input"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { formatToman } from "@/lib/money"
import { formatJalali, nowTehran, jalaliOf } from "@/lib/jalali"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export default function RecurringPage() {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringDTO | null>(null)
  const [deleting, setDeleting] = useState<RecurringDTO | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["recurring"],
    queryFn: () => apiGet<{ rules: RecurringDTO[] }>("/api/recurring"),
  })
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryDTO[] }>("/api/categories"),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/api/recurring/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  })

  const runMutation = useMutation({
    mutationFn: (ruleId: string) => apiPost<{ message: string }>("/api/recurring/run", { ruleId }),
    onSuccess: (res) => {
      toast.success(res.message)
      haptic.success()
      qc.invalidateQueries()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      haptic.error()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/recurring/${id}`),
    onSuccess: () => {
      toast.success("قاعده حذف شد")
      qc.invalidateQueries()
      setDeleting(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rules = data?.rules ?? []
  const accounts = (accountsData?.accounts ?? []).filter((a) => !a.isArchived)
  const categories = categoriesData?.categories ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="تراکنش‌های تکرارشونده"
        subtitle="هزینه‌ها و درآمدهای دوره‌ای به‌صورت خودکار ثبت می‌شوند"
        actions={
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            قاعده جدید
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Repeat className="size-6" />
          </span>
          <h3 className="mt-4 font-bold">هنوز قاعده‌ای تعریف نشده</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            اجاره، حقوق، اشتراک‌ها و… را به‌صورت خودکار ثبت کنید
          </p>
          <Button className="mt-4 rounded-xl" onClick={() => setFormOpen(true)}>
            ساخت اولین قاعده
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className={cn(
                "rounded-2xl border border-border bg-card shadow-card transition-shadow duration-200 hover:shadow-card-hover",
                !r.isActive && "opacity-60"
              )}
            >
              <div className="flex items-center gap-3 p-4">
                <EntityIcon
                  icon={r.category?.icon ?? (r.type === "INCOME" ? "TrendingUp" : "Repeat")}
                  color={r.category?.color ?? (r.type === "INCOME" ? "#16A34A" : "#6B7280")}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{r.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <AmountText amount={r.amount} type={r.type === "INCOME" ? "INCOME" : "EXPENSE"} showSign={false} compact />
                    <span>•</span>
                    <span>{r.frequencyLabel}</span>
                    {r.frequency === "MONTHLY_JALALI" && r.dayOfMonth ? (
                      <span className="nums">(روز {toPersianDigits(r.dayOfMonth)})</span>
                    ) : null}
                    <span>•</span>
                    <span>{r.account?.name}</span>
                  </div>
                  <div className="mt-1 text-[0.68rem] text-muted-foreground">
                    اجرای بعدی: <span className="nums">{formatJalali(new Date(r.nextRunAt))}</span>
                    {r.runCount > 0 ? (
                      <>
                        {" — "}
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        >
                          {toPersianDigits(r.runCount)} اجرا <ChevronDown className={cn("inline size-3 transition-transform", expanded === r.id && "rotate-180")} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={(checked: boolean) => toggleMutation.mutate({ id: r.id, isActive: checked })}
                    aria-label="فعال/غیرفعال"
                  />
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="اجرا вручی"
                      title="اجرا فوری"
                      onClick={() => runMutation.mutate(r.id)}
                      disabled={runMutation.isPending}
                    >
                      {runMutation.isPending && runMutation.variables === r.id ? <Loader2 className="animate-spin" /> : <Play />}
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label="ویرایش" onClick={() => { setEditing(r); setFormOpen(true) }}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="حذف"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>

              {expanded === r.id ? (
                <div className="border-t border-border/70 bg-muted/40 px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <History className="size-3.5" />
                    آخرین اجراها
                  </div>
                  {r.generated.length > 0 ? (
                    <div className="space-y-1.5">
                      {r.generated.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs">
                          <span className="nums text-muted-foreground">{formatJalali(new Date(t.date))}</span>
                          <AmountText amount={t.amount} type={r.type === "INCOME" ? "INCOME" : "EXPENSE"} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">تاریخچه‌ای موجود نیست</p>
                  )}
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>
      )}

      {formOpen ? (
        <RecurringFormModal
          key={editing?.id ?? "new"}
          rule={editing}
          accounts={accounts}
          categories={categories}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف قاعده «${deleting?.title ?? ""}»`}
        description="قاعده حذف می‌شود اما تراکنش‌های قبلی که ساخته شده‌اند باقی می‌مانند."
        confirmText="حذف کن"
        destructive
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}

function RecurringFormModal({
  rule,
  accounts,
  categories,
  onClose,
}: {
  rule: RecurringDTO | null
  accounts: AccountDTO[]
  categories: CategoryDTO[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!rule
  const [title, setTitle] = useState(rule?.title ?? "")
  const [type, setType] = useState<"INCOME" | "EXPENSE">(rule?.type ?? "EXPENSE")
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "")
  const [accountId, setAccountId] = useState(rule?.accountId ?? accounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "none")
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY_JALALI">(rule?.frequency ?? "MONTHLY_JALALI")
  const [interval, setIntervalValue] = useState(String(rule?.interval ?? 1))
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.dayOfMonth ?? jalaliOf(nowTehran()).jd))
  const [startDate, setStartDate] = useState<Date>(rule ? new Date(rule.nextRunAt) : nowTehran())

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNum = Math.round(Number(amount || "0"))
      if (!title.trim()) throw new Error("عنوان را وارد کنید")
      if (!amountNum || amountNum <= 0) throw new Error("مبلغ را وارد کنید")
      if (!accountId) throw new Error("حساب را انتخاب کنید")
      const body = {
        title: title.trim(),
        type,
        amount: amountNum,
        accountId,
        categoryId: categoryId === "none" ? null : categoryId,
        frequency,
        interval: Number(interval) || 1,
        dayOfMonth: frequency === "MONTHLY_JALALI" ? Number(dayOfMonth) : null,
        startDate: startDate.toISOString(),
      }
      if (isEdit) {
        return apiPatch(`/api/recurring/${rule!.id}`, body)
      }
      return apiPost("/api/recurring", body)
    },
    onSuccess: () => {
      toast.success(isEdit ? "قاعده ویرایش شد" : "قاعده تکرارشونده ساخته شد")
      qc.invalidateQueries()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const typeCategories = categories.filter((c) => c.type === type)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">{isEdit ? "ویرایش قاعده تکرارشونده" : "قاعده تکرارشونده جدید"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً اجاره محل" maxLength={80} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "INCOME" | "EXPENSE")}
                items={[
                  { value: "EXPENSE", label: "هزینه" },
                  { value: "INCOME", label: "درآمد" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">هزینه</SelectItem>
                  <SelectItem value="INCOME">درآمد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>حساب</Label>
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
          </div>

          <div className="space-y-1.5">
            <Label>مبلغ (تومان)</Label>
            <PriceInput value={amount} onValueChange={setAmount} showWords showCurrencyToggle={false} placeholder="0" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>تواتر</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as "DAILY" | "WEEKLY" | "MONTHLY_JALALI")}
                items={[
                  { value: "DAILY", label: "روزانه" },
                  { value: "WEEKLY", label: "هفتگی" },
                  { value: "MONTHLY_JALALI", label: "ماهانه شمسی" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">روزانه</SelectItem>
                  <SelectItem value="WEEKLY">هفتگی</SelectItem>
                  <SelectItem value="MONTHLY_JALALI">ماهانه شمسی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>هر چند {frequency === "DAILY" ? "روز" : frequency === "WEEKLY" ? "هفته" : "ماه"}</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={interval}
                onChange={(e) => setIntervalValue(e.target.value)}
                dir="ltr"
                className="text-center nums"
              />
            </div>
          </div>

          {frequency === "MONTHLY_JALALI" ? (
            <div className="space-y-1.5">
              <Label>روز ماه شمسی</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                dir="ltr"
                className="text-center nums"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{isEdit ? "اجرای بعدی" : "شروع از"}</Label>
              <JalaliDatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label>دسته (اختیاری)</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId(v ?? "none")}
                items={[{ value: "none", label: "بدون دسته" }, ...typeCategories.map((c) => ({ value: c.id, label: c.name }))]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون دسته</SelectItem>
                  {typeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={mutation.isPending}>
            {isEdit ? "ذخیره تغییرات" : "ساخت قاعده"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
