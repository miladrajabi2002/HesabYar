"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Pencil, Trash2, Archive, ArchiveRestore, Plus, Wallet, TrendingDown, TrendingUp } from "lucide-react"
import { apiGet, apiDelete, apiPatch, apiPost, ApiError } from "@/lib/api-client"
import type { AccountDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { AccountFormModal } from "@/components/accounts/account-form-modal"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EntityIcon } from "@/components/shared/money-display"
import { CountUp } from "@/components/shared/count-up"
import { CategoryManager } from "@/components/accounts/category-manager"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatToman } from "@/lib/money"
import { ACCOUNT_TYPE_LABELS } from "@/lib/validation"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export default function AccountsPage() {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AccountDTO | null>(null)
  const [deleting, setDeleting] = useState<AccountDTO | null>(null)
  const [deleteMode, setDeleteMode] = useState<"DELETE_TRANSACTIONS" | "MOVE_TRANSACTIONS">("MOVE_TRANSACTIONS")
  const [moveTo, setMoveTo] = useState<string>("")
  const [deleteCount, setDeleteCount] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })

  const accounts = data?.accounts ?? []
  const active = accounts.filter((a) => !a.isArchived)
  const archived = accounts.filter((a) => a.isArchived)
  const totalBalance = active.reduce((s, a) => s + a.balance, 0)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleting) return
      if (deleteCount === null) {
        // مرحله اول: حذف بدون action — اگر تراکنش داشته باشد 409 برمی‌گردد
        return apiDelete(`/api/accounts/${deleting.id}`)
      }
      if (deleteMode === "MOVE_TRANSACTIONS" && !moveTo) {
        throw new Error("حساب مقصد را انتخاب کنید")
      }
      const params = new URLSearchParams({ action: deleteMode })
      if (deleteMode === "MOVE_TRANSACTIONS") params.set("moveTo", moveTo)
      return apiDelete(`/api/accounts/${deleting.id}?${params.toString()}`)
    },
    onSuccess: () => {
      toast.success("حساب حذف شد")
      haptic.success()
      qc.invalidateQueries()
      setDeleting(null)
      setDeleteCount(null)
    },
    onError: (e: ApiError) => {
      if (e.status === 409 && e.data && typeof e.data.transactionCount === "number") {
        setDeleteCount(e.data.transactionCount)
        const others = active.filter((a) => a.id !== deleting?.id)
        if (others.length > 0) setMoveTo((prev) => prev || others[0].id)
        if (others.length === 0) setDeleteMode("DELETE_TRANSACTIONS")
      } else {
        toast.error(e.message)
      }
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      apiPatch(`/api/accounts/${id}`, { isArchived }),
    onSuccess: (_d, vars) => {
      toast.success(vars.isArchived ? "حساب آرشیو شد" : "حساب از آرشیو خارج شد")
      qc.invalidateQueries()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="حساب‌ها و دسته‌ها"
        subtitle={
          data ? (
            <span>
              موجودی کل: <span className="nums font-bold text-primary">{formatToman(totalBalance)}</span>
            </span>
          ) : (
            "در حال بارگذاری…"
          )
        }
        actions={
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            حساب جدید
          </Button>
        }
      />

      <Tabs defaultValue="accounts" dir="rtl">
        <TabsList className="rounded-xl">
          <TabsTrigger value="accounts">حساب‌ها</TabsTrigger>
          <TabsTrigger value="categories">دسته‌بندی‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4 space-y-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Wallet className="size-6" />
              </span>
              <h3 className="mt-4 font-bold">هنوز حسابی نساخته‌اید</h3>
              <p className="mt-1 text-sm text-muted-foreground">اولین کیف پول یا حساب بانکی خود را بسازید</p>
              <Button className="mt-4 rounded-xl" onClick={() => setFormOpen(true)}>
                ساخت اولین حساب
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <EntityIcon icon={a.icon} color={a.color} size="lg" />
                      <div>
                        <div className="text-sm font-bold">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[a.type]}</div>
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-lg:opacity-100">
                      <Button variant="ghost" size="icon-xs" aria-label="ویرایش" onClick={() => { setEditing(a); setFormOpen(true) }}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="آرشیو"
                        onClick={() => archiveMutation.mutate({ id: a.id, isArchived: true })}
                      >
                        <Archive />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="حذف"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setDeleting(a)
                          setDeleteCount(null)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  <div className="nums mt-4 text-2xl font-extrabold" dir="rtl">
                    <CountUp value={a.balance} format={(n) => formatToman(n)} />
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="nums flex items-center gap-1">
                      <TrendingUp className="size-3.5 text-income" />
                      ماه: {formatToman(a.monthIn, false)}
                    </span>
                    <span className="nums flex items-center gap-1">
                      <TrendingDown className="size-3.5 text-expense" />
                      {formatToman(a.monthOut, false)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {archived.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4">
              <div className="mb-3 text-xs font-semibold text-muted-foreground">حساب‌های آرشیوشده</div>
              <div className="space-y-2">
                {archived.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5">
                    <div className="flex items-center gap-2.5 text-sm">
                      <EntityIcon icon={a.icon} color={a.color} size="sm" />
                      <span className="font-medium">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="nums text-xs text-muted-foreground">{formatToman(a.balance, false)}</span>
                      <Button variant="ghost" size="icon-xs" aria-label="بازگردانی" onClick={() => archiveMutation.mutate({ id: a.id, isArchived: false })}>
                        <ArchiveRestore />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager />
        </TabsContent>
      </Tabs>

      {formOpen ? (
        <AccountFormModal key={editing?.id ?? "new"} account={editing} onClose={() => setFormOpen(false)} />
      ) : null}

      {/* حذف امن حساب */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            setDeleteCount(null)
          }
        }}
        title={`حذف حساب «${deleting?.name ?? ""}»`}
        description={
          deleteCount === null
            ? "آیا از حذف این حساب مطمئن هستید؟"
            : `این حساب ${deleteCount} تراکنش دارد. برای حذف، تکلیف تراکنش‌ها را مشخص کنید:`
        }
        confirmText={deleteCount === null ? "حذف کن" : "حذف نهایی"}
        destructive
        onConfirm={() => deleteMutation.mutate()}
      >
        {deleteCount !== null && deleteCount > 0 ? (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteMode("MOVE_TRANSACTIONS")}
                className={cn(
                  "rounded-xl border p-3 text-xs font-semibold transition-colors",
                  deleteMode === "MOVE_TRANSACTIONS" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                )}
              >
                جابه‌جایی تراکنش‌ها
              </button>
              <button
                type="button"
                onClick={() => setDeleteMode("DELETE_TRANSACTIONS")}
                className={cn(
                  "rounded-xl border p-3 text-xs font-semibold transition-colors",
                  deleteMode === "DELETE_TRANSACTIONS" ? "border-destructive bg-destructive/5 text-destructive" : "border-border text-muted-foreground"
                )}
              >
                حذف همه تراکنش‌ها
              </button>
            </div>
            {deleteMode === "MOVE_TRANSACTIONS" ? (
              <Select
                value={moveTo}
                onValueChange={(v) => setMoveTo(v ?? "")}
                items={active.filter((a) => a.id !== deleting?.id).map((a) => ({ value: a.id, label: a.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {active
                    .filter((a) => a.id !== deleting?.id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-destructive">⚠️ همه {deleteCount} تراکنش این حساب برای همیشه حذف می‌شوند.</p>
            )}
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
