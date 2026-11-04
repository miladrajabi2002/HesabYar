"use client"

/**
 * PWA Provider (SEC-02 + SEC-03 + ADV-10 — ارتقا با الگوی app)
 *  - ثبت سرویس‌ورکر (کش آفلاین + نوتیفیکیشن پوش)
 *  - پرامپت «افزودن به صفحه اصلی» اندروید + راهنمای آیفون
 *  - نشانگر آفلاین/آنلاین
 *  - تازه: کارت پیشنهاد شناور — چند ثانیه بعد از ورود (نه در صفحهٔ لاگین):
 *      • دستگاه قابل نصب → «نصب حساب‌یار» (اندروید/کروم: پنجرهٔ نصب واقعی، آیفون: راهنمای Add to Home Screen)
 *      • داخل اپ نصب‌شده با اعلان پرسیده‌نشده → «اعلان‌ها را روشن کن» (سررسید چک‌ها با نوتیف می‌آید)
 *      • «بعداً» کارت را ۱۴ روز پنهان می‌کند
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { WifiOff, Wifi, Download, Share, PlusSquare, BellRing, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useTelegram } from "@/hooks/use-telegram"
import { haptic } from "@/hooks/use-haptics"
import { enablePush, isIOS, isStandalone as detectStandalone, pushCapable } from "@/lib/push-client"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// مرورگر این رویداد را یک بار و اغلب پیش از mount شدن React می‌فرستد: همین‌جا نگهش می‌داریم
let deferredInstall: BeforeInstallPromptEvent | null = null
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredInstall = event as BeforeInstallPromptEvent
    window.dispatchEvent(new Event("hy:install-available"))
  })
}

const DISMISS_DAYS = 14
const KEY_INSTALL = "hy:pwa-install-dismissed"
const KEY_PUSH = "hy:pwa-push-dismissed"

function dismissedRecently(key: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(key) || 0)
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}
function rememberDismiss(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {
    // حالت خصوصی: کارت دفعهٔ بعد دوباره می‌آید
  }
}

const isMacSafari = () =>
  typeof navigator !== "undefined" && /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent) && navigator.maxTouchPoints === 0

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

type Card = "install" | "push" | null

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [installSheet, setInstallSheet] = useState(false)
  const [card, setCard] = useState<Card>(null)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [justBackOnline, setJustBackOnline] = useState(false)
  const [swRegistered, setSwRegistered] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [hasPrompt, setHasPrompt] = useState(false)
  const { isTelegram } = useTelegram()
  const wasOfflineRef = useRef(false)
  const onLogin = pathname?.startsWith("/login") ?? false

  // ثبت سرویس‌ورکر
  useEffect(() => {
    const t = setTimeout(() => {
      setStandalone(detectStandalone())
      setHasPrompt(!!deferredInstall)
    }, 0)
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => clearTimeout(t)
    // داخل مینی‌اپ تلگرام سرویس‌ورکر لازم نیست (نوتیف از خود تلگرام می‌آید)
    if (isTelegram === true) return () => clearTimeout(t)
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => setSwRegistered(true))
      .catch(() => {
        /* ignore */
      })
    return () => clearTimeout(t)
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

  // کدام پیشنهاد (اگر هست) برای این دستگاه — فقط بعد از ورود و چند ثانیه بعد از باز شدن
  useEffect(() => {
    if (isTelegram === true) return // داخل مینی‌اپ تلگرام، تلگرام خودش میزبان است
    if (onLogin) {
      setCard(null)
      return
    }
    let cancelled = false
    const decide = () => {
      if (cancelled) return
      if (detectStandalone()) {
        if (pushCapable() && typeof Notification !== "undefined" && Notification.permission === "default" && !dismissedRecently(KEY_PUSH)) setCard("push")
        return
      }
      if (dismissedRecently(KEY_INSTALL)) return
      if (deferredInstall || (isIOS() && !detectStandalone()) || isMacSafari()) setCard("install")
    }
    const timer = window.setTimeout(decide, 3500)
    const onAvailable = () => {
      setHasPrompt(true)
      if (!detectStandalone() && !dismissedRecently(KEY_INSTALL)) setCard("install")
    }
    const onInstalled = () => {
      deferredInstall = null
      setHasPrompt(false)
      setCard(null)
      toast.success("نصب شد — از این به بعد از صفحهٔ اصلی بازش کن")
    }
    window.addEventListener("hy:install-available", onAvailable)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener("hy:install-available", onAvailable)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [onLogin, isTelegram])

  const promptInstall = useCallback(() => {
    if (deferredInstall?.prompt) {
      deferredInstall.prompt()
    } else {
      // آیفون/سافاری — راهنمای اشتراک‌گذاری
      setInstallSheet(true)
    }
  }, [])

  const dismiss = () => {
    rememberDismiss(card === "push" ? KEY_PUSH : KEY_INSTALL)
    setCard(null)
  }

  const act = async () => {
    haptic.tap()
    if (card === "push") {
      setBusy(true)
      try {
        await enablePush()
        toast.success("اعلان‌ها روشن شد — سررسید چک‌ها را همین‌جا خبر می‌کنیم")
        setCard(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "اجازهٔ اعلان داده نشد")
        if (typeof Notification !== "undefined" && Notification.permission !== "default") setCard(null)
      } finally {
        setBusy(false)
      }
      return
    }
    await promptInstall()
  }

  const value = useMemo(
    () => ({ canInstall: !standalone && (hasPrompt || isIOS() || isMacSafari()), promptInstall, isStandalone: standalone }),
    [hasPrompt, standalone, promptInstall]
  )

  const copy =
    card === "push"
      ? { icon: BellRing, title: "اعلان‌ها را روشن کن", body: "سررسید چک‌ها و کارهای امروز، حتی وقتی اپ باز نیست.", action: "روشن کن" }
      : {
          icon: Download,
          title: "حساب‌یار را نصب کن",
          body: isIOS()
            ? "روی صفحهٔ اصلی بگذار تا تمام‌صفحه باز شود و هشدار چک‌ها را با اعلان بگیری."
            : "مثل یک اپ کامل: تمام‌صفحه، سریع و آفلاین — با اعلان سررسید چک‌ها.",
          action: deferredInstall || hasPrompt ? "نصب" : "نحوهٔ نصب",
        }
  const CardIcon = copy.icon

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

      {/* کارت پیشنهاد نصب / اعلان — شناور بالای نوار پایین */}
      <AnimatePresence>
        {card && !onLogin && (
          <motion.aside
            key={card}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] z-[140] mx-auto max-w-sm rounded-3xl border border-border/70 bg-card p-3.5 shadow-float sm:inset-x-auto sm:right-4 lg:bottom-4"
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="بعداً"
              className="absolute left-2 top-2 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="size-4" />
            </button>
            <div className="flex items-start gap-3 pe-7">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CardIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-label font-extrabold">{copy.title}</p>
                <p className="mt-0.5 text-caption leading-5 text-muted-foreground">{copy.body}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 pe-7">
              <Button onClick={act} disabled={busy} className="h-10 flex-1 rounded-xl text-label font-bold">
                {busy ? "…" : copy.action}
              </Button>
              <Button variant="ghost" onClick={dismiss} className="h-10 rounded-xl text-label">
                بعداً
              </Button>
            </div>
          </motion.aside>
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
