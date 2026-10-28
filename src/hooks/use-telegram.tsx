"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

interface TelegramWebApp {
  initData: string
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string }
  }
  version?: string
  platform?: string
  colorScheme?: string
  isExpanded?: boolean
  ready(): void
  expand(): void
  close(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void
    notificationOccurred(type: "error" | "success" | "warning"): void
    selectionChanged(): void
  }
  MainButton?: {
    text: string
    isVisible: boolean
    isEnabled: boolean
    show(): void
    hide(): void
    setText(text: string): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
    enable(): void
    disable(): void
    showProgress(leaveActive?: boolean): void
    hideProgress(): void
    setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void
  }
  BackButton?: {
    show(): void
    hide(): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

interface TelegramContextValue {
  webApp: TelegramWebApp | null
  /** آیا داخل مینی‌اپ تلگرام اجرا شده است */
  isTelegram: boolean
  /** آیا کاربر تلگرامیِ شناسایی‌شده، ادمین است */
  user: { id: number; name: string } | null
  haptic: {
    success: () => void
    error: () => void
    warning: () => void
    tap: () => void
    medium: () => void
  }
}

const TelegramContext = createContext<TelegramContextValue>({
  webApp: null,
  isTelegram: false,
  user: null,
  haptic: {
    success: () => {},
    error: () => {},
    warning: () => {},
    tap: () => {},
    medium: () => {},
  },
})

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) return
    const t = setTimeout(() => {
      setWebApp(tg)
      try {
        tg.ready()
        tg.expand()
        tg.disableVerticalSwipes?.()
        tg.setHeaderColor?.("#F7F8FA")
        tg.setBackgroundColor?.("#F7F8FA")
      } catch {
        /* ignore */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const value = useMemo<TelegramContextValue>(() => {
    const isTelegram = !!webApp?.initData
    const u = webApp?.initDataUnsafe?.user
    const haptic = webApp?.HapticFeedback
    return {
      webApp,
      isTelegram,
      user: u ? { id: u.id, name: u.first_name || u.username || "" } : null,
      haptic: {
        success: () => haptic?.notificationOccurred("success"),
        error: () => haptic?.notificationOccurred("error"),
        warning: () => haptic?.notificationOccurred("warning"),
        tap: () => haptic?.selectionChanged(),
        medium: () => haptic?.impactOccurred("medium"),
      },
    }
  }, [webApp])

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
}

export function useTelegram() {
  return useContext(TelegramContext)
}
