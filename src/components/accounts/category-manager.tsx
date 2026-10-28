"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { Pencil, Trash2, Plus, Tags } from "lucide-react"
import { apiGet, apiDelete, apiPatch, apiPost, ApiError } from "@/lib/api-client"
import type { CategoryDTO } from "@/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IconColorPicker } from "@/components/shared/icon-color-picker"
import { EntityIcon } from "@/components/shared/money-display"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toPersianDigits } from "@/lib/money"
import { useTelegram } from "@/hooks/use-telegram"

/** مدیریت دسته‌بندی درآمد/هزینه */
export function CategoryManager() {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryDTO | null>(null)
  const [deleting, setDeleting] = useState<CategoryDTO | null>(null)
  const [deleteCount, setDeleteCount] = useState<number | null>(null)
  const [deleteMode, setDeleteMode] = useState<"CLEAR_CATEGORY" | "MOVE_TRANSACTIONS">("MOVE_TRANSACTIONS")
  const [moveTo, setMoveTo] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ categories: CategoryDTO[] }>("/api/categories"),
  })
  const categories = data?.categories ?? []

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleting) return
      if (deleteCount === null) {
        return apiDelete(`/api/categories/${deleting.id}`)
      }
      if (deleteMode === "MOVE_TRANSACTIONS" && !moveTo) {
        throw new Error("دسته مقصد را انتخاب کنید")
      }
      const params = new URLSearchParams({ action: deleteMode })
      if (deleteMode === "MOVE_TRANSACTIONS") params.set("moveTo", moveTo)
      return apiDelete(`/api/categories/${deleting.id}?${params.toString()}`)
    },
    onSuccess: () => {
      toast.success("دسته حذف شد")
      qc.invalidateQueries()
      setDeleting(null)
      setDeleteCount(null)
    },
    onError: (e: ApiError) => {
      if (e.status === 409 && e.data && typeof e.data.transactionCount === "number") {
        setDeleteCount(e.data.transactionCount)
        const others = categories.filter((c) => c.type === deleting?.type && c.id !== deleting?.id)
        if (others.length > 0) setMoveTo((prev) => prev || others[0].id)
        if (others.length === 0) setDeleteMode("CLEAR_CATEGORY")
      } else {
        toast.error(e.message)
      }
    },
  })

  const expense = categories.filter((c) => c.type === "EXPENSE")
  const income = categories.filter((c) => c.type === "INCOME")

  const renderList = (list: CategoryDTO[], title: string) => (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{toPersianDigits(list.length)} دسته</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {list.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
          >
            <EntityIcon icon={c.icon} color={c.color} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {toPersianDigits(c.transactionCount)} تراکنش
                {c.budgetCount > 0 ? ` — ${toPersianDigits(c.budgetCount)} بودجه` : ""}
              </div>
            </div>
            <div className="flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-lg:opacity-100">
              <Button variant="ghost" size="icon-xs" aria-label="ویرایش" onClick={() => { setEditing(c); setFormOpen(true) }}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="حذف"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setDeleting(c)
                  setDeleteCount(null)
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" />
          دسته جدید
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Tags className="size-6" />
          </span>
          <h3 className="mt-4 font-bold">دسته‌ای وجود ندارد</h3>
          <p className="mt-1 text-sm text-muted-foreground">برای تفکیک بهتر هزینه‌ها، دسته‌بندی بسازید</p>
        </div>
      ) : (
        <>
          {renderList(expense, "دسته‌های هزینه")}
          {renderList(income, "دسته‌های درآمد")}
        </>
      )}

      {formOpen ? (
        <CategoryFormModal
          key={editing?.id ?? "new"}
          category={editing}
          onSaved={() => {
            haptic.success()
            qc.invalidateQueries()
          }}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            setDeleteCount(null)
          }
        }}
        title={`حذف دسته «${deleting?.name ?? ""}»`}
        description={
          deleteCount === null
            ? "آیا از حذف این دسته مطمئن هستید؟"
            : `این دسته ${toPersianDigits(deleteCount)} تراکنش دارد. تکلیف تراکنش‌ها و بودجه‌های آن را مشخص کنید:`
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
                انتقال به دسته دیگر
              </button>
              <button
                type="button"
                onClick={() => setDeleteMode("CLEAR_CATEGORY")}
                className={cn(
                  "rounded-xl border p-3 text-xs font-semibold transition-colors",
                  deleteMode === "CLEAR_CATEGORY" ? "border-destructive bg-destructive/5 text-destructive" : "border-border text-muted-foreground"
                )}
              >
                بدون دسته کردن
              </button>
            </div>
            {deleteMode === "MOVE_TRANSACTIONS" ? (
              <Select
                value={moveTo}
                onValueChange={(v) => setMoveTo(v ?? "")}
                items={categories
                  .filter((c) => c.type === deleting?.type && c.id !== deleting?.id)
                  .map((c) => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.type === deleting?.type && c.id !== deleting?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
            <p className="text-xs text-destructive">⚠️ بودجه‌های این دسته نیز حذف خواهند شد.</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function CategoryFormModal({
  category,
  onSaved,
  onClose,
}: {
  category?: CategoryDTO | null
  onSaved: () => void
  onClose: () => void
}) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? "")
  const [type, setType] = useState<"EXPENSE" | "INCOME">(category?.type ?? "EXPENSE")
  const [color, setColor] = useState(category?.color ?? "#F97316")
  const [icon, setIcon] = useState(category?.icon ?? "ShoppingBag")

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("نام دسته را وارد کنید")
      const body = { name: name.trim(), type, color, icon }
      if (isEdit) return apiPatch(`/api/categories/${category!.id}`, body)
      return apiPost("/api/categories", body)
    },
    onSuccess: () => {
      toast.success(isEdit ? "دسته ویرایش شد" : "دسته جدید ساخته شد")
      onSaved()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">{isEdit ? "ویرایش دسته" : "دسته جدید"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>نام دسته</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً خوراک" maxLength={40} />
          </div>

          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "EXPENSE" | "INCOME")}
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
            <Label>آیکون و رنگ</Label>
            <IconColorPicker icon={icon} color={color} onChange={(i, c) => { setIcon(i); setColor(c) }} />
          </div>

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={mutation.isPending}>
            {isEdit ? "ذخیره تغییرات" : "ساخت دسته"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
