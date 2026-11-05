"use client"

/**
 * شیت جزئیات یک گردش بانکی (از «گردش اخیر» حساب‌ها)
 *  • تسویه نقدی → «ویرایش» (شیت تسویه) و «حذف»
 *  • انتقال       → «حذف» (هر دو سمت)
 *  • فاکتور/چک    → لینک به مبدأ (آن‌جا اصلاح می‌شود)
 *  • مانده اولیه  → راهنما (از ویرایش حساب)
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDownLeft, ArrowUpRight, FileText, CheckSquare2, Loader2, Pencil, Trash2 } from "lucide-react"
import { apiDelete } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { cn } from "@/lib/utils"

interface Tx {
  id: string
  direction: string
  amount: number
  type: string
  description: string
  date: string
  refId: string | null
  accountName: string
}

const TX_LABEL: Record<string, string> = {
  INVOICE_CASH: "فاکتور نقدی",
  CHECK_CASHED: "پاس چک",
  SETTLEMENT_CASH: "تسویه نقدی",
  TRANSFER: "انتقال",
  OPENING: "مانده اولیه",
}

export function TxSheet({
  tx,
  onClose,
  onOpenSettlement,
  onDeleted,
}: {
  tx: Tx | null
  onClose: () => void
  onOpenSettlement: (settlementId: string) => void
  onDeleted: () => Promise<void>
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const isIn = tx?.direction === "IN"

  const deletable = tx?.type === "SETTLEMENT_CASH" || tx?.type === "TRANSFER"

  const remove = async () => {
    if (!tx) return
    const isSettle = tx.type === "SETTLEMENT_CASH"
    const yes = await confirm({
      title: isSettle ? "حذف این دریافت/پرداخت" : "حذف این انتقال",
      description: "این کار برگشت ندارد",
      confirmText: "حذف",
      tone: "danger",
      consequences: isSettle
        ? ["تسویهٔ مربوط به شخص هم حذف می‌شود", "موجودی حساب و تراز شخص اصلاح می‌گردد"]
        : ["هر دو سمت انتقال (مبدأ و مقصد) پاک می‌شود", "موجودی هر دو حساب اصلاح می‌گردد"],
    })
    if (!yes) return
    setDeleting(true)
    try {
      await apiDelete(`/api/transactions/${tx.id}`)
      toast.success("حذف شد")
      await onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در حذف")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <BottomSheet
      open={!!tx}
      onClose={onClose}
      title={tx ? TX_LABEL[tx.type] ?? tx.type : undefined}
      description={tx?.accountName}
      footer={
        tx && (
          <div className="grid gap-2">
            {tx.type === "SETTLEMENT_CASH" && tx.refId && (
              <Button onClick={() => onOpenSettlement(tx.refId!)} className="h-12 w-full rounded-2xl font-bold">
                <Pencil className="size-4" />
                ویرایش
              </Button>
            )}
            {tx.type === "INVOICE_CASH" && tx.refId && (
              <Button onClick={() => router.push(`/invoices/${tx.refId}`)} className="h-12 w-full rounded-2xl font-bold">
                <FileText className="size-4" />
                مشاهده و اصلاح فاکتور
              </Button>
            )}
            {tx.type === "CHECK_CASHED" && (
              <Button onClick={() => router.push("/checks")} className="h-12 w-full rounded-2xl font-bold">
                <CheckSquare2 className="size-4" />
                رفتن به چک‌ها
              </Button>
            )}
            {deletable && (
              <Button
                variant="outline"
                onClick={remove}
                disabled={deleting}
                className="h-11 w-full rounded-2xl font-bold text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                حذف
              </Button>
            )}
            {tx.type === "OPENING" && (
              <p className="text-center text-caption text-muted-foreground">
                مانده اولیه را از «ویرایش حساب» تغییر دهید
              </p>
            )}
          </div>
        )
      }
    >
      {tx && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl",
                isIn ? "bg-sale/10 text-sale" : "bg-purchase/10 text-purchase"
              )}
            >
              {isIn ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {toPersianDigits(tx.description || TX_LABEL[tx.type] || tx.type)}
              </p>
              <p className="nums text-caption text-muted-foreground">{formatJalaliShort(new Date(tx.date))}</p>
            </div>
            <span dir="ltr" className={cn("nums shrink-0 text-base font-extrabold", isIn && "text-sale")}>
              {isIn ? "+" : "−"}
              {formatToman(tx.amount, false)}
            </span>
          </div>
          {(tx.type === "INVOICE_CASH" || tx.type === "CHECK_CASHED") && (
            <p className="text-label leading-6 text-muted-foreground">
              {tx.type === "INVOICE_CASH"
                ? "این گردش از پرداخت نقدی یک فاکتور ساخته شده؛ برای تغییر یا حذف، خود فاکتور را اصلاح کنید."
                : "این گردش از پاس‌شدن یک چک ساخته شده؛ برای برگرداندن، وضعیت چک را از صفحهٔ چک‌ها تغییر دهید."}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
