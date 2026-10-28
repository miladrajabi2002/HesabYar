"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriceInput } from "@/components/ui/price-input"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { EntityIcon } from "@/components/shared/money-display"
import { apiGet, apiPost, apiPatch } from "@/lib/api-client"
import type { AccountDTO, CategoryDTO, TransactionDTO } from "@/types"
import { useTelegram } from "@/hooks/use-telegram"
import { nowTehran } from "@/lib/jalali"
import { cn } from "@/lib/utils"

export type TxFormType = "EXPENSE" | "INCOME" | "TRANSFER"

const TYPE_TABS: { id: TxFormType; label: string }[] = [
  { id: "EXPENSE", label: "هزینه" },
  { id: "INCOME", label: "درآمد" },
  { id: "TRANSFER", label: "انتقال" },
]

interface TransactionFormProps {
  /** در حالت ویرایش پر می‌شود */
  initial?: TransactionDTO | null
  defaultType?: TxFormType
  onDone: () => void
}

/** فرم ثبت/ویرایش تراکنش — استفاده در ثبت سریع و ویرایش */
export function TransactionForm({ initial, defaultType = "EXPENSE", onDone }: TransactionFormProps) {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const isEdit = !!initial

  const [type, setType] = useState<TxFormType>(isEdit ? initial!.type : defaultType)
  const [amount, setAmount] = useState<string>(isEdit ? String(initial!.amount) : "")
  const [accountId, setAccountId] = useState<string>(isEdit ? initial!.accountId : "")
  const [toAccountId, setToAccountId] = useState<string>(isEdit ? initial!.toAccountId ?? "" : "")
  const [categoryId, setCategoryId] = useState<string>(isEdit ? initial!.categoryId ?? "none" : "none")
  const [date, setDate] = useState<Date>(isEdit ? new Date(initial!.date) : nowTehran())
  const [note, setNote] = useState<string>(isEdit ? initial!.note ?? "" : "")

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryDTO[] }>("/api/categories"),
  })

  const accounts = useMemo(
    () => (accountsData?.accounts ?? []).filter((a) => !a.isArchived),
    [accountsData]
  )
  const categories = useMemo(
    () => (categoriesData?.categories ?? []).filter((c) => c.type === type),
    [categoriesData, type]
  )

  // مقادیر مؤثر: اگر انتخاب خالی/نامعتبر بود، اولین گزینه معتبر در نظر گرفته می‌شود
  const effectiveAccountId = accounts.some((a) => a.id === accountId)
    ? accountId
    : accounts[0]?.id ?? ""
  const effectiveToAccountId = accounts.some((a) => a.id === toAccountId)
    ? toAccountId
    : accounts.find((a) => a.id !== effectiveAccountId)?.id ?? ""
  const effectiveCategoryId = categories.some((c) => c.id === categoryId) || categoryId === "none" || categoryId === ""
    ? categoryId
    : "none"

  const accountItems = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryItems = [
    { value: "none", label: "بدون دسته" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]

  const mutation = useMutation({
    mutationFn: async () => {
      const amountNum = Math.round(Number(amount || "0"))
      if (!amountNum || amountNum <= 0) throw new Error("مبلغ را وارد کنید")
      if (!effectiveAccountId) throw new Error("حساب را انتخاب کنید")
      if (type === "TRANSFER") {
        if (!effectiveToAccountId) throw new Error("حساب مقصد را انتخاب کنید")
        if (effectiveToAccountId === effectiveAccountId) throw new Error("حساب مبدأ و مقصد یکسان است")
        if (isEdit) {
          return apiPatch(`/api/transactions/${initial!.id}`, {
            type,
            amount: amountNum,
            accountId: effectiveAccountId,
            toAccountId: effectiveToAccountId,
            date: date.toISOString(),
            note: note || null,
          })
        }
        return apiPost("/api/transfers", {
          fromAccountId: effectiveAccountId,
          toAccountId: effectiveToAccountId,
          amount: amountNum,
          date: date.toISOString(),
          note: note || null,
        })
      }
      const body = {
        type,
        amount: amountNum,
        accountId: effectiveAccountId,
        categoryId: effectiveCategoryId === "none" ? null : effectiveCategoryId,
        date: date.toISOString(),
        note: note || null,
      }
      if (isEdit) return apiPatch(`/api/transactions/${initial!.id}`, body)
      return apiPost("/api/transactions", body)
    },
    onSuccess: () => {
      toast.success(isEdit ? "تراکنش ویرایش شد" : "تراکنش با موفقیت ثبت شد")
      haptic.success()
      qc.invalidateQueries()
      onDone()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      haptic.error()
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* تب نوع تراکنش */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1.5" dir="rtl">
        {TYPE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setType(t.id)
              haptic.tap()
            }}
            className={cn(
              "rounded-xl py-2 text-sm font-semibold transition-all duration-200",
              type === t.id
                ? t.id === "EXPENSE"
                  ? "bg-white text-expense shadow-sm"
                  : t.id === "INCOME"
                    ? "bg-white text-income shadow-sm"
                    : "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* مبلغ */}
      <div className="space-y-1.5">
        <Label>مبلغ (تومان)</Label>
        <PriceInput
          value={amount}
          onValueChange={(digits) => setAmount(digits)}
          showWords
          showCurrencyToggle={false}
          placeholder="0"
          className="text-lg font-bold"
        />
      </div>

      {/* حساب‌ها */}
      <div className={cn("grid gap-4", type === "TRANSFER" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
        <div className="space-y-1.5">
          <Label>{type === "TRANSFER" ? "از حساب" : "حساب"}</Label>
          <Select items={accountItems} value={effectiveAccountId} onValueChange={(v) => setAccountId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {type === "TRANSFER" ? (
          <div className="space-y-1.5">
            <Label>به حساب</Label>
            <Select items={accountItems} value={effectiveToAccountId} onValueChange={(v) => setToAccountId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>دسته‌بندی</Label>
            <Select items={categoryItems} value={effectiveCategoryId} onValueChange={(v) => setCategoryId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* تاریخ و یادداشت */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>تاریخ</Label>
          <JalaliDatePicker value={date} onChange={setDate} />
        </div>
        <div className="space-y-1.5">
          <Label>یادداشت (اختیاری)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً خرید هفتگی" maxLength={300} />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full rounded-xl text-base" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {isEdit ? "ذخیره تغییرات" : "ثبت تراکنش"}
      </Button>
    </form>
  )
}

export { EntityIcon }
