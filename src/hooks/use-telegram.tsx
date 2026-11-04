"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { haptic as buzzHaptic } from "@/hooks/use-haptics"

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
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
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
      // داخل مینی‌اپ تلگرام: فاصله امن پایین (نوار پایین تلگرام روی محتوا می‌افتد)
      // مقدار واقعی از CSS varهای رسمی تلگرام خوانده می‌شود (globals.css → --tg-safe-bottom)
      const isMiniApp = !!tg.initData || (tg.platform != null && tg.platform !== "unknown")
      if (isMiniApp) {
        document.documentElement.classList.add("tg-mini")
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
      // داخل تلگرام از HapticFeedback بومی؛ بیرون تلگرام (PWA/مرورگر) fallback به Vibration API
      haptic: {
        success: () => (haptic ? haptic.notificationOccurred("success") : buzzHaptic.success()),
        error: () => (haptic ? haptic.notificationOccurred("error") : buzzHaptic.error()),
        warning: () => (haptic ? haptic.notificationOccurred("warning") : buzzHaptic.warning()),
        tap: () => (haptic ? haptic.selectionChanged() : buzzHaptic.tap()),
        medium: () => (haptic ? haptic.impactOccurred("medium") : buzzHaptic.medium()),
      },
    }
  }, [webApp])

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
}

export function useTelegram() {
  return useContext(TelegramContext)
}

/**
 * IMP-02: دکمه برگشت بومی تلگرام — داخل مینی‌اپ، دکمه Back گوشی
 * بدون این hook فشردنش مینی‌اپ را می‌بندد؛ با این hook مثل اپ واقعی به عقب برمی‌گردد.
 * @param enabled روشن/خاموش (پیش‌فرض روشن داخل مینی‌اپ)
 * @param fallback رفتار دلخواه (پیش‌فرض router.back())
 */
export function useTelegramBackButton(enabled = true, fallback?: () => void) {
  const { webApp, isTelegram } = useTelegram()
  const router = useRouter()

  useEffect(() => {
    if (!isTelegram || !webApp?.BackButton || !enabled) return
    const bb = webApp.BackButton
    const handler = fallback ?? (() => router.back())
    try {
      bb.onClick(handler)
      bb.show()
    } catch {
      /* ignore */
    }
    return () => {
      try {
        bb.offClick(handler)
        bb.hide()
      } catch {
        /* ignore */
      }
    }
  }, [isTelegram, webApp, enabled, fallback, router])
}

/**
 * IMP-05: دکمه ثبت بومی تلگرام (MainButton) — فرم‌ها با دکمه پایین خود تلگرام ثبت می‌شوند.
 * دکمه داخلی اپ هم می‌ماند؛ در مینی‌اپ دکمه اصلی پایین صفحه خود تلگرام است.
 */
export function useTelegramMainButton(options: {
  visible: boolean
  text: string
  enabled?: boolean
  loading?: boolean
  color?: string
  onClick: () => void
}) {
  const { webApp, isTelegram } = useTelegram()
  const { visible, text, enabled = true, loading = false, color, onClick } = options
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  useEffect(() => {
    if (!isTelegram || !webApp?.MainButton) return
    const mb = webApp.MainButton
    const handler = () => onClickRef.current()
    try {
      if (!visible) {
        mb.hide()
        return
      }
      mb.setText(text)
      mb.setParams({
        color: color || "#0E7C66",
        text_color: "#FFFFFF",
        is_active: enabled && !loading,
      })
      if (loading) mb.showProgress(true)
      else mb.hideProgress()
      mb.onClick(handler)
      mb.show()
    } catch {
      /* ignore */
    }
    return () => {
      try {
        mb.offClick(handler)
        mb.hide()
        mb.hideProgress()
      } catch {
        /* ignore */
      }
    }
  }, [isTelegram, webApp, visible, text, enabled, loading, color])
}
