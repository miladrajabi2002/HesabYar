"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TransactionForm } from "@/components/quick-add/transaction-form"
import type { TransactionDTO } from "@/types"

/** دیالوگ ویرایش تراکنش */
export function TransactionEditDialog({
  tx,
  onOpenChange,
}: {
  tx: TransactionDTO | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!tx} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">ویرایش تراکنش</DialogTitle>
        </DialogHeader>
        {tx ? <TransactionForm key={tx.id} initial={tx} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
