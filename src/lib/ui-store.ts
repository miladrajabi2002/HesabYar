"use client"

import { create } from "zustand"

export type NewInvoiceType = "SALE" | "PURCHASE"

interface UIState {
  moreSheetOpen: boolean
  setMoreSheetOpen: (open: boolean) => void
  /** زیرعنوان کاربردی هدر موبایل («۳۴۸ فاکتور · آبان ۱۴۰۵») — خالی = تاریخ امروز */
  pageSub: string | null
  setPageSub: (sub: string | null) => void
  /** شناسه‌هایی که حذفشان منتظر پایان فرصت «بازگردانی» است — از فهرست‌ها پنهان می‌مانند */
  pendingDeletes: string[]
  setPendingDelete: (id: string, pending: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  moreSheetOpen: false,
  setMoreSheetOpen: (open) => set({ moreSheetOpen: open }),
  pageSub: null,
  setPageSub: (pageSub) => set({ pageSub }),
  pendingDeletes: [],
  setPendingDelete: (id, pending) =>
    set((s) => ({
      pendingDeletes: pending ? [...s.pendingDeletes.filter((x) => x !== id), id] : s.pendingDeletes.filter((x) => x !== id),
    })),
}))
