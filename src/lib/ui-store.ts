"use client"

import { create } from "zustand"

export type NewInvoiceType = "SALE" | "PURCHASE"

interface UIState {
  moreSheetOpen: boolean
  setMoreSheetOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  moreSheetOpen: false,
  setMoreSheetOpen: (open) => set({ moreSheetOpen: open }),
}))
