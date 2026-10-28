"use client"

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useUIStore } from "@/lib/ui-store"
import { TransactionForm } from "./transaction-form"

/** باتم‌شیت سراسری «ثبت سریع» با drag-to-close */
export function QuickAddSheet() {
  const { quickAddOpen, closeQuickAdd, quickAddTab } = useUIStore()

  return (
    <Drawer open={quickAddOpen} onOpenChange={(open) => !open && closeQuickAdd()}>
      <DrawerContent className="rounded-t-[24px] mx-auto max-w-lg" dir="rtl">
        <DrawerHeader className="pb-0">
          <DrawerTitle className="text-center text-base font-bold">ثبت سریع تراکنش</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[75vh] overflow-y-auto p-4 pb-8">
          <TransactionForm defaultType={quickAddTab} onDone={closeQuickAdd} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
