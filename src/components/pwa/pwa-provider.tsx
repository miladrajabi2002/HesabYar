"use client"

/**
 * PWA Provider (SEC-02 + SEC-03 + ADV-10)
 *  - ثبت سرویس‌ورکر (کش آفلاین + نوتیفیکیشن پوش)
 *  - پرامپت «افزودن به صفحه اصلی» اندروید + راهنمای آیفون
 *  - نشانگر آفلاین/آنلاین
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { WifiOff, Wifi, Download, Share, PlusSquare } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useTelegram } from "@/hooks/use-telegram"

interface PWAContextValue {
  canInstall: boolean
  promptInstall: () => void
  isStandalone: boolean
}

const PWAContext = createContext<PWAContextValue>({
  canInstall: false,
  promptInstall: () => {},
  isStandalone: false,
})

export function usePWA() {
  return useContext(PWAContext)
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<(Event & { prompt?: () => void }) | null>(null)
  const [installSheet, setInstallSheet] = useState(false)
  const [offline, setOffline] = useState(false)
  const [justBackOnline, setJustBackOnline] = useState(false)
  const [swRegistered, setSwRegistered] = useState(false)
  const { isTelegram } = useTelegram()
  const wasOfflineRef = useRef(false)

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)

  // ثبت سرویس‌ورکر
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    // داخل مینی‌اپ تلگرام سرویس‌ورکر لازم نیست (نوتیف از خود تلگرام می‌آید)
    if (isTelegram === true) return
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => setSwRegistered(true))
      .catch(() => {
        /* ignore */
      })
  }, [isTelegram])

  // وضعیت آنلاین/آفلاین
  useEffect(() => {
    const update = () => {
      const nowOffline = !navigator.onLine
      setOffline(nowOffline)
      if (nowOffline) {
        wasOfflineRef.current = true
      } else if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        setJustBackOnline(true)
        setTimeout(() => setJustBackOnline(false), 3200)
      }
    }
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  // رویداد نصب PWA (کروم/اندروید)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt?: () => void })
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const promptInstall = useCallback(() => {
    if (deferredPrompt?.prompt) {
      deferredPrompt.prompt()
    } else {
      // آیفون/سافاری — راهنمای اشتراک‌گذاری
      setInstallSheet(true)
    }
  }, [deferredPrompt])

  const value = useMemo(
    () => ({ canInstall: !!deferredPrompt || !isStandalone, promptInstall, isStandalone }),
    [deferredPrompt, isStandalone, promptInstall]
  )

  return (
    <PWAContext.Provider value={value}>
      {children}

      {/* نشانگر آفلاین */}
      <AnimatePresence>
        {offline && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-warning px-4 py-2 text-xs font-bold text-warning-foreground shadow-lg"
          >
            <WifiOff className="size-4" />
            آفلاین هستید — داده‌ها امن هستند و بعد از اتصال همگام می‌شوند
          </motion.div>
        )}
      </AnimatePresence>

      {/* توست بازگشت آنلاین + sync */}
      <AnimatePresence>
        {justBackOnline && swRegistered && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-income px-4 py-2 text-xs font-bold text-white shadow-lg"
          >
            <Wifi className="size-4" />
            آنلاین شدید — همگام‌سازی انجام می‌شود…
          </motion.div>
        )}
      </AnimatePresence>

      {/* شیت راهنمای نصب آیفون */}
      <BottomSheet open={installSheet} onClose={() => setInstallSheet(false)} title="نصب روی صفحه اصلی">
        <div className="space-y-4">
          <p className="text-xs leading-6 text-muted-foreground">
            حساب‌یار مثل یک اپ واقعی نصب می‌شود — آیکون اختصاصی، تمام‌صفحه و نوتیفیکیشن هشدارها (آیفون iOS ۱۶.۴ به بالا).
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Share className="size-5" />
              </span>
              <div className="flex-1 text-xs leading-5">
                <b>گام ۱:</b> دکمه <b>Share</b> (اشتراک‌گذاری) پایین صفحه سافاری را بزنید.
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PlusSquare className="size-5" />
              </span>
              <div className="flex-1 text-xs leading-5">
                <b>گام ۲:</b> گزینه <b>«Add to Home Screen»</b> را انتخاب کنید.
              </div>
            </div>
          </div>
          <Button onClick={() => setInstallSheet(false)} className="h-12 w-full rounded-2xl font-bold">
            <Download className="size-4" />
            متوجه شدم
          </Button>
        </div>
      </BottomSheet>
    </PWAContext.Provider>
  )
}

/** دکمه کوچک نصب — برای هدر/تنظیمات */
export function InstallButton({ className }: { className?: string }) {
  const { canInstall, promptInstall, isStandalone } = usePWA()
  if (isStandalone || !canInstall) return null
  return (
    <button
      type="button"
      onClick={promptInstall}
      className={
        className ??
        "flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-caption font-bold text-primary transition-colors hover:bg-primary/10"
      }
    >
      <Download className="size-4" />
      نصب اپ
    </button>
  )
}
