"use client"

import { create } from "zustand"

export type NewInvoiceType = "SALE" | "PURCHASE"

interface UIState {
  moreSheetOpen: boolean
  addSheetOpen: boolean
  setMoreSheetOpen: (open: boolean) => void
  openAddSheet: () => void
  closeAddSheet: () => void
}

export const useUIStore = create<UIState>((set) => ({
  moreSheetOpen: false,
  addSheetOpen: false,
  setMoreSheetOpen: (open) => set({ moreSheetOpen: open }),
  openAddSheet: () => set({ addSheetOpen: true }),
  closeAddSheet: () => set({ addSheetOpen: false }),
}))
