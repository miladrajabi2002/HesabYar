"use client"

import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from "lucide-react"
import { EntityIcon, AmountText } from "@/components/shared/money-display"
import { formatJalaliShort } from "@/lib/jalali"
import type { TransactionDTO } from "@/types"
import { cn } from "@/lib/utils"

/** یک ردیف تراکنش در لیست‌ها */
export function TransactionRow({
  tx,
  onEdit,
  onDelete,
  showDate = false,
}: {
  tx: TransactionDTO
  onEdit?: (tx: TransactionDTO) => void
  onDelete?: (tx: TransactionDTO) => void
  showDate?: boolean
}) {
  const isTransfer = tx.type === "TRANSFER"
  const isIncome = tx.type === "INCOME"

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150",
        (onEdit || onDelete) && "hover:bg-muted/60"
      )}
    >
      {isTransfer ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ArrowLeftRight className="size-4.5" />
        </span>
      ) : (
        <EntityIcon
          icon={tx.category?.icon ?? "CircleDollarSign"}
          color={tx.category?.color ?? (isIncome ? "#16A34A" : "#E5484D")}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {isTransfer
            ? `${tx.account?.name ?? ""} ← ${tx.toAccount?.name ?? ""}`
            : tx.category?.name ?? (isIncome ? "درآمد" : "هزینه")}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {showDate ? `${formatJalaliShort(new Date(tx.date))} — ` : ""}
          {tx.note || (isTransfer ? "انتقال بین حساب" : tx.account?.name)}
          {!isTransfer && tx.note ? ` — ${tx.account?.name}` : ""}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="text-sm font-bold">
          <AmountText amount={tx.amount} type={tx.type} />
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(tx)}
            aria-label="ویرایش"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all duration-150 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 max-lg:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(tx)}
            aria-label="حذف"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all duration-150 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 max-lg:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isIncome ? (
        <ArrowDownLeft className="hidden size-0" aria-hidden />
      ) : (
        <ArrowUpRight className="hidden size-0" aria-hidden />
      )}
    </div>
  )
}
