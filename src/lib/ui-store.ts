"use client"

import { create } from "zustand"

export type QuickAddTab = "EXPENSE" | "INCOME" | "TRANSFER"

interface UIState {
  quickAddOpen: boolean
  quickAddTab: QuickAddTab
  moreSheetOpen: boolean
  openQuickAdd: (tab?: QuickAddTab) => void
  closeQuickAdd: () => void
  setQuickAddTab: (tab: QuickAddTab) => void
  setMoreSheetOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  quickAddOpen: false,
  quickAddTab: "EXPENSE",
  moreSheetOpen: false,
  openQuickAdd: (tab) => set({ quickAddOpen: true, quickAddTab: tab ?? "EXPENSE" }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  setQuickAddTab: (tab) => set({ quickAddTab: tab }),
  setMoreSheetOpen: (open) => set({ moreSheetOpen: open }),
}))
