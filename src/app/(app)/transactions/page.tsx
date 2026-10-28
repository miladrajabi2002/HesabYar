"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { apiGet, apiDelete } from "@/lib/api-client"
import type { AccountDTO, CategoryDTO, TransactionDTO, TransactionsResponseDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { TransactionRow } from "@/components/transactions/transaction-row"
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatToman, toPersianDigits } from "@/lib/money"
import {
  formatJalaliWithWeekday,
  jalaliDayKey,
  startOfJalaliMonth,
  endOfJalaliMonth,
  nowTehran,
  addJalaliMonths,
} from "@/lib/jalali"
import { useUIStore } from "@/lib/ui-store"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30

type TypeFilter = "ALL" | "INCOME" | "EXPENSE" | "TRANSFER"

export default function TransactionsPage() {
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [type, setType] = useState<TypeFilter>("ALL")
  const [accountId, setAccountId] = useState<string>("all")
  const [categoryId, setCategoryId] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<TransactionDTO | null>(null)
  const [deleting, setDeleting] = useState<TransactionDTO | null>(null)

  // فیلتر بازه: پیش‌فرض این ماه شمسی
  const [from, setFrom] = useState<Date>(() => startOfJalaliMonth(nowTehran()))
  const [to, setTo] = useState<Date>(() => endOfJalaliMonth(nowTehran()))

  const { openQuickAdd } = useUIStore()

  // جست‌وجوی زنده با debounce
  useMemo(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryDTO[] }>("/api/categories"),
  })

  const params = new URLSearchParams()
  params.set("from", from.toISOString())
  params.set("to", to.toISOString())
  if (type !== "ALL") params.set("type", type)
  if (accountId !== "all") params.set("accountId", accountId)
  if (categoryId !== "all") params.set("categoryId", categoryId)
  if (debouncedQ) params.set("q", debouncedQ)
  params.set("page", String(page))
  params.set("pageSize", String(PAGE_SIZE))

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", params.toString()],
    queryFn: () => apiGet<TransactionsResponseDTO>(`/api/transactions?${params.toString()}`),
    placeholderData: (prev) => prev,
  })

  // گروه‌بندی بر اساس روز شمسی
  const groups = useMemo(() => {
    const map = new Map<string, TransactionDTO[]>()
    for (const tx of data?.transactions ?? []) {
      const key = jalaliDayKey(new Date(tx.date))
      const arr = map.get(key) ?? []
      arr.push(tx)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [data])

  const quickRanges = [
    { label: "این ماه", from: startOfJalaliMonth(nowTehran()), to: endOfJalaliMonth(nowTehran()) },
    {
      label: "ماه قبل",
      from: startOfJalaliMonth(addJalaliMonths(nowTehran(), -1)),
      to: endOfJalaliMonth(addJalaliMonths(nowTehran(), -1)),
    },
    { label: "۳ ماه", from: startOfJalaliMonth(addJalaliMonths(nowTehran(), -2)), to: endOfJalaliMonth(nowTehran()) },
    { label: "همه", from: new Date(Date.UTC(2020, 0, 1)), to: new Date(Date.UTC(2099, 0, 1)) },
  ]

  const setRange = (f: Date, t: Date) => {
    setFrom(f)
    setTo(t)
    setPage(1)
  }

  const deleteTx = async () => {
    if (!deleting) return
    try {
      await apiDelete(`/api/transactions/${deleting.id}`)
      toast.success("تراکنش حذف شد")
      setDeleting(null)
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف ناموفق بود")
    }
  }

  const accounts = accountsData?.accounts ?? []
  const categories = categoriesData?.categories ?? []
  const activeQuick = quickRanges.find(
    (r) => r.from.getTime() === from.getTime() && r.to.getTime() === to.getTime()
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="تراکنش‌ها"
        subtitle={
          data
            ? `${toPersianDigits(data.total)} تراکنش — درآمد ${formatToman(data.totals.income, false)} / هزینه ${formatToman(data.totals.expense, false)} تومان`
            : "در حال بارگذاری…"
        }
        actions={
          <Button onClick={() => openQuickAdd()} className="rounded-xl">
            ثبت تراکنش
          </Button>
        }
      />

      {/* فیلترها */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {quickRanges.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(r.from, r.to)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                activeQuick?.label === r.label
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجو در یادداشت‌ها…"
              className="ps-9"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="پاک کردن"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as TypeFilter)
              setPage(1)
            }}
            items={[
              { value: "ALL", label: "همه انواع" },
              { value: "INCOME", label: "درآمد" },
              { value: "EXPENSE", label: "هزینه" },
              { value: "TRANSFER", label: "انتقال" },
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه انواع</SelectItem>
              <SelectItem value="INCOME">درآمد</SelectItem>
              <SelectItem value="EXPENSE">هزینه</SelectItem>
              <SelectItem value="TRANSFER">انتقال</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v as string)
              setPage(1)
            }}
            items={[
              { value: "all", label: "همه حساب‌ها" },
              ...accounts.filter((a) => !a.isArchived).map((a) => ({ value: a.id, label: a.name })),
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه حساب‌ها</SelectItem>
              {accounts
                .filter((a) => !a.isArchived)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v as string)
              setPage(1)
            }}
            items={[
              { value: "all", label: "همه دسته‌ها" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه دسته‌ها</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* لیست گروه‌بندی‌شده بر اساس روز شمسی */}
      {isLoading && !data ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SlidersHorizontal />
              </EmptyMedia>
              <EmptyTitle>تراکنشی یافت نشد</EmptyTitle>
              <EmptyDescription>
                با تغییر فیلترها جست‌وجو کنید یا اولین تراکنش این بازه را ثبت کنید
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([dayKey, txs]) => {
            const dayDate = new Date(txs[0].date)
            const dayNet = txs.reduce((acc, t) => {
              if (t.type === "INCOME") return acc + t.amount
              if (t.type === "EXPENSE") return acc - t.amount
              return acc
            }, 0)
            return (
              <div key={dayKey} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
                  <span className="nums text-xs font-bold text-foreground">{formatJalaliWithWeekday(dayDate)}</span>
                  {dayNet !== 0 ? (
                    <Badge variant="outline" className={cn("nums text-[0.65rem]", dayNet > 0 ? "text-income" : "text-expense")}>
                      {dayNet > 0 ? "+" : "−"} {formatToman(Math.abs(dayNet), false)}
                    </Badge>
                  ) : null}
                </div>
                <div className="divide-y divide-border/60 p-1.5">
                  {txs.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} onEdit={setEditing} onDelete={setDeleting} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* بارگذاری تدریجی */}
          {data && data.total > page * PAGE_SIZE ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setPage((p) => p + 1)}>
                نمایش بیشتر ({toPersianDigits(data.total - page * PAGE_SIZE)} مورد باقی‌مانده)
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <TransactionEditDialog tx={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف تراکنش"
        description="این تراکنش برای همیشه حذف می‌شود و موجودی حساب‌ها بازمحاسبه خواهد شد."
        confirmText="حذف کن"
        destructive
        onConfirm={deleteTx}
      />
    </div>
  )
}
