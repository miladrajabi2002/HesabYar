"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IconColorPicker } from "@/components/shared/icon-color-picker"
import { PriceInput } from "@/components/ui/price-input"
import { apiPost, apiPatch } from "@/lib/api-client"
import type { AccountDTO } from "@/types"
import { ACCOUNT_TYPE_LABELS } from "@/lib/validation"
import { useTelegram } from "@/hooks/use-telegram"

const ACCOUNT_TYPES = ["CASH", "BANK", "CARD", "SAVINGS", "OTHER"] as const

/**
 * مودال ایجاد/ویرایش حساب — والد با key و mount مشروط باز/بسته می‌کند
 * (الگوی remount برای مقداردهی اولیه تمیز فرم)
 */
export function AccountFormModal({
  account,
  onClose,
}: {
  account?: AccountDTO | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { haptic } = useTelegram()
  const isEdit = !!account

  const [name, setName] = useState(account?.name ?? "")
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>(account?.type ?? "CASH")
  const [color, setColor] = useState(account?.color ?? "#0E7C66")
  const [icon, setIcon] = useState(account?.icon ?? "Wallet")
  const [initialBalance, setInitialBalance] = useState(account ? String(account.initialBalance) : "")

  const mutation = useMutation({
    mutationFn: async () => {
      const balance = Math.round(Number(initialBalance || "0"))
      if (!name.trim()) throw new Error("نام حساب را وارد کنید")
      const body = {
        name: name.trim(),
        type,
        color,
        icon,
        initialBalance: Math.max(0, balance),
      }
      if (isEdit) return apiPatch(`/api/accounts/${account!.id}`, body)
      return apiPost("/api/accounts", body)
    },
    onSuccess: () => {
      toast.success(isEdit ? "حساب ویرایش شد" : "حساب جدید ساخته شد")
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
          <DialogTitle className="text-center">{isEdit ? "ویرایش حساب" : "حساب جدید"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>نام حساب</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً کیف پول یا بانک ملت" maxLength={50} />
          </div>

          <div className="space-y-1.5">
            <Label>نوع حساب</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as (typeof ACCOUNT_TYPES)[number])}
              items={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>آیکون و رنگ</Label>
            <IconColorPicker icon={icon} color={color} onChange={(i, c) => { setIcon(i); setColor(c) }} />
          </div>

          <div className="space-y-1.5">
            <Label>موجودی اولیه (تومان)</Label>
            <PriceInput
              value={initialBalance}
              onValueChange={(d) => setInitialBalance(d)}
              showWords={false}
              showCurrencyToggle={false}
              placeholder="0"
            />
          </div>

          <Button type="submit" className="w-full rounded-xl" size="lg" disabled={mutation.isPending}>
            {isEdit ? "ذخیره تغییرات" : "ساخت حساب"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
