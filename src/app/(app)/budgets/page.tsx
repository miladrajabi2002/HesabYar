"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { ChevronRight, ChevronLeft, Plus, PieChart, Copy, Pencil, Trash2, Loader2 } from "lucide-react"
import { apiGet, apiDelete, apiPost, apiPatch } from "@/lib/api-client"
import type { BudgetsResponseDTO, BudgetDTO, CategoryDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EntityIcon } from "@/components/shared/money-display"
import { CountUp } from "@/components/shared/count-up"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriceInput } from "@/components/ui/price-input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatToman, formatPercent, toPersianDigits } from "@/lib/money"
import { currentMonthKey, previousMonthKey, nextMonthKey, monthKeyLabel } from "@/lib/jalali"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export default function BudgetsPage() {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [month, setMonth] = useState(() => currentMonthKey())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BudgetDTO | null>(null)
  const [deleting, setDeleting] = useState<BudgetDTO | null>(null)
  const [copying, setCopying] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["budgets", month],
    queryFn: () => apiGet<BudgetsResponseDTO>(`/api/budgets?monthJalali=${month}`),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryDTO[] }>("/api/categories"),
  })

  const expenseCategories = (categoriesData?.categories ?? []).filter((c) => c.type === "EXPENSE")

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/budgets/${id}`),
    onSuccess: () => {
      toast.success("بودجه حذف شد")
      qc.invalidateQueries()
      setDeleting(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copyMutation = useMutation({
    mutationFn: async () => {
      const prev = previousMonthKey(month)
      const prevRes = await apiGet<BudgetsResponseDTO>(`/api/budgets?monthJalali=${prev}`)
      if (prevRes.budgets.length === 0) throw new Error("در ماه قبل بودجه‌ای برای کپی وجود ندارد")
      let copied = 0
      for (const b of prevRes.budgets) {
        try {
          await apiPost("/api/budgets", {
            categoryId: b.categoryId,
            amount: b.amount,
            monthJalali: month,
            alertThreshold: b.alertThreshold,
          })
          copied++
        } catch {
          /* ردشدن تکراری‌ها */
        }
      }
      return copied
    },
    onSuccess: (copied) => {
      toast.success(copied > 0 ? `${toPersianDigits(copied)} بودجه از ماه قبل کپی شد` : "همه بودجه‌های ماه قبل از قبل موجود بود")
      haptic.success()
      qc.invalidateQueries()
      setCopying(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const budgets = data?.budgets ?? []
  const summary = data?.summary

  const barColor = (b: BudgetDTO) => {
    if (b.percent >= 100) return "bg-expense"
    if (b.percent >= b.alertThreshold) return "bg-warning"
    return "bg-income"
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="بودجه‌بندی ماهانه"
        subtitle="سقف هزینه هر دسته را مشخص کنید و هشدار عبور از آستانه را دریافت کنید"
        actions={
          <div className="flex gap-2">
            {budgets.length > 0 ? (
              <Button variant="outline" className="rounded-xl" onClick={() => setCopying(true)} disabled={copyMutation.isPending}>
                {copyMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                کپی از ماه قبل
              </Button>
            ) : null}
            <Button
              className="rounded-xl"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" />
              بودجه جدید
            </Button>
          </div>
        }
      />

      {/* سوییچ ماه شمسی */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-card">
          <Button variant="ghost" size="icon-sm" aria-label="ماه قبل" onClick={() => setMonth(previousMonthKey(month))}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-bold">{monthKeyLabel(month)}</span>
          <Button variant="ghost" size="icon-sm" aria-label="ماه بعد" onClick={() => setMonth(nextMonthKey(month))}>
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      {/* خلاصه ماه */}
      {summary && budgets.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">مصرف کل از سقف کل</div>
              <div className="nums mt-1 text-lg font-extrabold" dir="rtl">
                <CountUp value={summary.totalSpent} format={(n) => formatToman(n, false)} /> از{" "}
                {formatToman(summary.totalAmount, false)} تومان
              </div>
            </div>
            <div className={cn(
              "nums rounded-full px-3.5 py-1.5 text-sm font-extrabold",
              summary.percent >= 100 ? "bg-expense/10 text-expense" : summary.percent >= 80 ? "bg-warning/10 text-warning" : "bg-income/10 text-income"
            )}>
              {formatPercent(summary.percent)}
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, summary.percent)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full rounded-full", summary.percent >= 100 ? "bg-expense" : summary.percent >= 80 ? "bg-warning" : "bg-income")}
            />
          </div>
        </motion.div>
      ) : null}

      {/* لیست بودجه‌ها */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <PieChart className="size-6" />
          </span>
          <h3 className="mt-4 font-bold">برای {monthKeyLabel(month)} بودجه‌ای ثبت نشده</h3>
          <p className="mt-1 text-sm text-muted-foreground">برای دسته‌های هزینه‌ای سقف ماهانه تعیین کنید</p>
          <Button className="mt-4 rounded-xl" onClick={() => { setEditing(null); setFormOpen(true) }}>
            تعیین بودجه
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className="group rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <EntityIcon icon={b.category.icon} color={b.category.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{b.category.name}</span>
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "nums text-sm font-extrabold",
                          b.percent >= 100 ? "text-expense" : b.percent >= b.alertThreshold ? "text-warning" : "text-income"
                        )}
                      >
                        {formatPercent(b.percent)}
                      </span>
                      <div className="flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-lg:opacity-100">
                        <Button variant="ghost" size="icon-xs" aria-label="ویرایش" onClick={() => { setEditing(b); setFormOpen(true) }}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="حذف"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleting(b)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="nums mt-0.5 text-xs text-muted-foreground">
                    {formatToman(b.spent, false)} از {formatToman(b.amount, false)} تومان — باقیمانده{" "}
                    <span className={b.remaining < 0 ? "text-expense" : ""}>{formatToman(b.remaining, false)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, b.percent)}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className={cn("h-full rounded-full", barColor(b))}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {formOpen ? (
        <BudgetFormModal
          key={editing?.id ?? `new-${month}`}
          month={month}
          budget={editing}
          categories={expenseCategories}
          existingCategoryIds={budgets.map((b) => b.categoryId)}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف بودجه"
        description="سقف هزینه این دسته برای ماه جاری حذف می‌شود."
        confirmText="حذف کن"
        destructive
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={copying}
        onOpenChange={setCopying}
        title="کپی بودجه‌ها از ماه قبل"
        description={`همه بودجه‌های ${monthKeyLabel(previousMonthKey(month))} به ${monthKeyLabel(month)} کپی می‌شوند (بودجه‌های تکراری رد می‌شوند).`}
        confirmText="کپی کن"
        onConfirm={() => copyMutation.mutate()}
      />
    </div>
  )
}

function BudgetFormModal({
  month,
  budget,
  categories,
  existingCategoryIds,
  onClose,
}: {
  month: string
  budget: BudgetDTO | null
  categories: CategoryDTO[]
  existingCategoryIds: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!budget
  const available = useMemo(
    () => categories.filter((c) => isEdit || !existingCategoryIds.includes(c.id)),
    [categories, existingCategoryIds, isEdit]
  )
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? available[0]?.id ?? "")
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "")
  const [threshold, setThreshold] = useState(String(budget?.alertThreshold ?? 80))

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNum = Math.round(Number(amount || "0"))
      const th = Number(threshold || "80")
      if (!categoryId) throw new Error("دسته را انتخاب کنید")
      if (!amountNum || amountNum <= 0) throw new Error("مبلغ سقف را وارد کنید")
      if (th < 1 || th > 100) throw new Error("آستانه هشدار باید بین ۱ تا ۱۰۰ باشد")
      if (isEdit) {
        return apiPatch(`/api/budgets/${budget!.id}`, { amount: amountNum, alertThreshold: th })
      }
      return apiPost("/api/budgets", { categoryId, amount: amountNum, monthJalali: month, alertThreshold: th })
    },
    onSuccess: () => {
      toast.success(isEdit ? "بودجه ویرایش شد" : "بودجه جدید تعیین شد")
      qc.invalidateQueries()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">{isEdit ? "ویرایش بودجه" : `بودجه جدید — ${monthKeyLabel(month)}`}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          {!isEdit ? (
            <div className="space-y-1.5">
              <Label>دسته هزینه</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId(v ?? "")}
                items={available.map((c) => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>سقف ماهانه (تومان)</Label>
            <PriceInput value={amount} onValueChange={setAmount} showWords showCurrencyToggle={false} placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label>آستانه هشدار ({toPersianDigits(threshold)}٪)</Label>
            <Input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Number(threshold) || 80}
              onChange={(e) => setThreshold(e.target.value)}
              className="accent-primary"
              dir="ltr"
            />
            <div className="flex justify-between text-[0.65rem] text-muted-foreground">
              <span>۱۰٪</span>
              <span className="nums">هشدار در {toPersianDigits(threshold || 80)}٪ مصرف</span>
              <span>۱۰۰٪</span>
            </div>
          </div>

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={mutation.isPending}>
            {isEdit ? "ذخیره تغییرات" : "تعیین بودجه"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
