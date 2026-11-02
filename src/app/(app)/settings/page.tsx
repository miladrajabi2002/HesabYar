"use client"

/**
 * تنظیمات — ربات تلگرام، ورود بیومتریک (Passkey)، اعلان‌های Push،
 * هشدار سررسید چک، بکاپ/بازیابی (با رمز اختیاری SEC-08)، پاک‌سازی داده
 */
import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Send,
  BellRing,
  DatabaseBackup,
  Upload,
  Download,
  Loader2,
  Trash2,
  ShieldAlert,
  Check,
  Fingerprint,
  Bell,
} from "lucide-react"
import {
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser"
import { apiGet, apiPost, apiPut, apiUpload, apiDelete, ApiError } from "@/lib/api-client"
import { toPersianDigits } from "@/lib/money"
import { formatJalali } from "@/lib/jalali"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/ui/confirm"
import { useTelegram } from "@/hooks/use-telegram"
import { cn } from "@/lib/utils"

interface Settings {
  botTokenMasked: string | null
  hasBotToken: boolean
  botTokenSource: string | null
  adminChatId: string | null
  hasAdminChatId: boolean
  miniAppUrl: string
  checkDueDaysBefore: number
  morningReminder: boolean
  morningHour: number
  telegramBackup: boolean
  hasBackupPassword: boolean
}

interface PasskeyItem {
  id: string
  deviceName: string
  createdAt: string
  lastUsedAt: string | null
}

/** تبدیل کلید عمومی VAPID (base64url) به Uint8Array برای pushManager.subscribe */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** هدر احراز هویت برای fetch خام (بدون api-client) — مثل مینی‌اپ تلگرام */
function rawAuthHeaders(): Record<string, string> {
  const initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData : undefined
  return initData ? { "x-telegram-init-data": initData } : {}
}

/** انتظار برای آماده‌شدن سرویس‌ورکر با مهلت زمانی (ready ممکن است هیچ‌وقت resolve نشود) */
function awaitServiceWorkerReady(ms = 6000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<Settings>("/api/settings"),
  })
  const { confirm } = useConfirm()
  const { isTelegram } = useTelegram()

  const [token, setToken] = useState("")
  const [chatId, setChatId] = useState("")
  const [miniAppUrl, setMiniAppUrl] = useState("")
  const [dueDays, setDueDays] = useState(3)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [wipeSheet, setWipeSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Passkey (SEC-01) ─────────────────────────────────
  const [deviceName, setDeviceName] = useState("")
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null)

  const passkeysQuery = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiGet<{ keys: PasskeyItem[] }>("/api/passkey/list"),
  })
  const passkeys = passkeysQuery.data?.keys ?? null

  // بررسی پشتیبانی مرورگر از WebAuthn / بیومتریک (بعد از هیدریشن تا mismatch نشود)
  useEffect(() => {
    let cancelled = false
    const check = browserSupportsWebAuthn()
      ? platformAuthenticatorIsAvailable().catch(() => false)
      : Promise.resolve(false)
    check.then((available) => {
      if (!cancelled) setPasskeySupported(available)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** ثبت Passkey روی همین دستگاه — مثل جریان ورود صفحه لاگین */
  const registerPasskey = async () => {
    setPasskeyBusy(true)
    try {
      const device = deviceName.trim()
      const qs = device ? `?device=${encodeURIComponent(device)}` : ""
      // ۱) گزینه‌های چالش از سرور
      const opts = await apiGet<{ options: PublicKeyCredentialCreationOptionsJSON }>(
        `/api/passkey/register${qs}`
      )
      // ۲) تأیید بیومتریک (اثر انگشت / Face ID) در مرورگر
      const attestation = await startRegistration({ optionsJSON: opts.options })
      // ۳) ارسال پاسخ به سرور برای ذخیره کلید
      const r = await apiPost<{ message?: string }>("/api/passkey/register", {
        credential: attestation,
        deviceName: device || undefined,
      })
      toast.success(r.message || "کلید با موفقیت ثبت شد")
      setDeviceName("")
      await queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.info("ثبت بیومتریک لغو شد")
      } else {
        toast.error(err instanceof Error ? err.message : "ثبت کلید ناموفق بود")
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  /** حذف یک Passkey با تأیید */
  const removePasskey = async (k: PasskeyItem) => {
    const yes = await confirm({
      title: "حذف کلید بیومتریک؟",
      description: `کلید «${k.deviceName}» حذف می‌شود؛ با این دستگاه دیگر نمی‌توان بدون رمز وارد شد.`,
      confirmText: "بله، حذف کن",
      tone: "danger",
    })
    if (!yes) return
    setDeletingKeyId(k.id)
    try {
      await apiDelete(`/api/passkey/list?id=${encodeURIComponent(k.id)}`)
      toast.success("کلید حذف شد")
      await queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف کلید ناموفق بود")
    } finally {
      setDeletingKeyId(null)
    }
  }

  // ─── اعلان‌های Push (SEC-03) ──────────────────────────
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [testingPush, setTestingPush] = useState(false)
  const [pushCapable, setPushCapable] = useState<boolean | null>(null)

  // قابلیت مرورگر + وضعیت ذخیره‌شده (پرچم localStorage + اشتراک واقعی)
  useEffect(() => {
    const capable =
      "serviceWorker" in navigator && "Notification" in window && "PushManager" in window
    // در تسکِ بعد از هیدریشن ست می‌شود تا خروجی سرور/کلاینت یکسان بماند
    const t = window.setTimeout(() => setPushCapable(capable), 0)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem("hesabyar:push") === "1"
    if (!stored || !("serviceWorker" in navigator)) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setPushOn(!!sub && Notification.permission === "granted")
      })
      .catch(() => {
        if (!cancelled) setPushOn(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enablePush = async () => {
    if (!pushCapable) {
      toast.error("این مرورگر از اعلان‌های Push پشتیبانی نمی‌کند")
      return
    }
    setPushBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        toast.error("اجازه اعلان داده نشد — از تنظیمات مرورگر مجوز را فعال کنید")
        return
      }
      // کلید عمومی VAPID از سرور
      let publicKey: string
      try {
        const r = await apiGet<{ publicKey: string }>("/api/push")
        publicKey = r.publicKey
      } catch (e) {
        toast.error(
          e instanceof ApiError && e.status === 503
            ? "نوتیفیکیشن روی سرور تنظیم نشده (کلید VAPID موجود نیست)"
            : e instanceof Error
              ? e.message
              : "خطا در دریافت کلید اعلان"
        )
        return
      }
      const reg = await awaitServiceWorkerReady()
      if (!reg) throw new Error("سرویس‌اورکر آماده نشد — یک بار صفحه را رفرش کنید")
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("اطلاعات اشتراک اعلان ناقص است")
      }
      await apiPost("/api/push", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      window.localStorage.setItem("hesabyar:push", "1")
      setPushOn(true)
      toast.success("اعلان‌ها فعال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فعال‌سازی اعلان ناموفق بود")
    } finally {
      setPushBusy(false)
    }
  }

  const disablePush = async () => {
    setPushBusy(true)
    try {
      if ("serviceWorker" in navigator) {
        const reg = await awaitServiceWorkerReady()
        const sub = await reg?.pushManager.getSubscription()
        if (sub) {
          // حذف اشتراک از سرور — DELETE با بدنه JSON (apiDelete بدنه ندارد)
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "content-type": "application/json", ...rawAuthHeaders() },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => null)
          await sub.unsubscribe()
        }
      }
      window.localStorage.removeItem("hesabyar:push")
      setPushOn(false)
      toast.success("اعلان‌ها غیرفعال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "غیرفعال‌سازی اعلان ناموفق بود")
    } finally {
      setPushBusy(false)
    }
  }

  const testPush = async () => {
    setTestingPush(true)
    try {
      const r = await apiPut<{ message?: string }>("/api/push")
      toast.success(r.message || "اعلان آزمایشی ارسال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال ناموفق")
    } finally {
      setTestingPush(false)
    }
  }

  // ─── بکاپ رمزدار (SEC-08) ────────────────────────────
  const [backupPassword, setBackupPassword] = useState("")
  const [backingUp, setBackingUp] = useState(false)

  const downloadBackup = async () => {
    const pw = backupPassword.trim()
    if (pw && pw.length < 4) {
      toast.error("رمز بکاپ باید حداقل ۴ کاراکتر باشد")
      return
    }
    setBackingUp(true)
    try {
      // fetch → blob → دانلود؛ رمز در آدرس‌بار و تاریخ مرورگر دیده نمی‌شود
      const res = await fetch(`/api/backup${pw ? `?password=${encodeURIComponent(pw)}` : ""}`, {
        headers: rawAuthHeaders(),
      })
      if (!res.ok) {
        let msg = "دانلود بکاپ ناموفق بود"
        try {
          const j = (await res.json()) as { error?: string }
          if (j?.error) msg = j.error
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const cd = res.headers.get("content-disposition") ?? ""
      const nameMatch = /filename="?([^";]+)"?/i.exec(cd)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = nameMatch?.[1] ?? "hesab-yar-backup.db"
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success(pw ? "بکاپ رمزگذاری‌شده دانلود شد" : "فایل بکاپ دانلود شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "دانلود بکاپ ناموفق بود")
    } finally {
      setBackingUp(false)
    }
  }

  const restoreBackup = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    // فایل رمزگذاری‌شده (SEC-08) با همین رمز باز می‌شود
    const pw = backupPassword.trim()
    if (pw) fd.append("password", pw)
    try {
      const r = await apiUpload<{ message: string }>("/api/backup/restore", fd)
      toast.success(r.message + " — صفحه دوباره بارگذاری می‌شود")
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "بازیابی ناموفق")
    }
  }

  const wipe = async () => {
    setWiping(true)
    try {
      await apiPost("/api/data/wipe", { confirm: "WIPE" })
      toast.success("همه داده‌ها پاک شد")
      setWipeSheet(false)
      await queryClient.invalidateQueries()
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در پاک‌سازی")
    } finally {
      setWiping(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiPut("/api/settings", {
        botToken: token || undefined,
        adminChatId: chatId || undefined,
        miniAppUrl: miniAppUrl || undefined,
        checkDueDaysBefore: dueDays,
      })
      toast.success("تنظیمات ذخیره شد")
      setToken("")
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  const testTelegram = async () => {
    setTesting(true)
    try {
      const r = await apiPost<{ message?: string }>("/api/telegram/test")
      toast.success(r.message || "پیام آزمایشی ارسال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال ناموفق")
    } finally {
      setTesting(false)
    }
  }

  if (data) {
    // مقداردهی اولیه فرم‌ها
    if (chatId === "" && data.adminChatId) setChatId(data.adminChatId)
    if (miniAppUrl === "" && data.miniAppUrl) setMiniAppUrl(data.miniAppUrl)
    if (!miniAppUrl && !data.miniAppUrl) {
      /* noop */
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="hidden text-lg font-extrabold lg:block lg:text-xl">تنظیمات</h1>

      {/* ربات تلگرام */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Send className="size-4 -scale-x-100 text-primary" />
          ربات تلگرام
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              توکن ربات
              {data.hasBotToken && (
                <span className={cn("ms-2 rounded-md px-1.5 py-px text-[0.6rem]", "bg-primary/10 text-primary")}>
                  فعال ({data.botTokenMasked}) — از {data.botTokenSource === "db" ? "دیتابیس" : "env"}
                </span>
              )}
            </label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={data.hasBotToken ? "برای تغییر، توکن جدید را وارد کنید" : "123456:ABC-DEF…"}
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              شناسه چت ادمین (Chat ID)
            </label>
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="مثلاً ۱۲۵۳۹۳۹۸۲۸"
              dir="ltr"
              className="nums font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              آدرس مینی‌اپ (دکمه «باز کردن حساب‌یار» داخل ربات)
            </label>
            <Input
              value={miniAppUrl}
              onChange={(e) => setMiniAppUrl(e.target.value)}
              placeholder="https://hesabyar.miladrajabi.com"
              dir="ltr"
              className="text-xs"
            />
          </div>

          <Button
            onClick={testTelegram}
            disabled={testing || !data.hasBotToken || !data.hasAdminChatId}
            variant="outline"
            className="h-11 w-full rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
            ارسال پیام آزمایشی
          </Button>
        </div>
      </section>

      {/* یادآوری صبحگاهی + بکاپ رمزدار تلگرام */}
      <TelegramAutomation settings={data} onSaved={() => refetch()} />

      {/* ورود بیومتریک — Passkey (SEC-01) */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Fingerprint className="size-4 text-primary" />
          ورود بیومتریک (Passkey)
        </div>
        <p className="mb-3 text-[0.68rem] leading-5 text-muted-foreground">
          با اثر انگشت یا Face ID بدون رمز وارد شوید.
        </p>

        {passkeySupported !== false ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                نام این دستگاه (اختیاری)
              </label>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="مثلاً: آیفون شخصی"
                className="text-xs"
              />
            </div>
            <Button
              onClick={registerPasskey}
              disabled={passkeyBusy}
              variant="outline"
              className="h-11 w-full rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
            >
              {passkeyBusy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
              افزودن Passkey این دستگاه
            </Button>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-[0.65rem] leading-5 text-muted-foreground">
            مرورگر این دستگاه از ورود بیومتریک (WebAuthn) پشتیبانی نمی‌کند — با کروم، سافاری یا اپ نصب‌شده امتحان کنید.
          </p>
        )}

        {/* کلیدهای ثبت‌شده */}
        <div className="mt-3 space-y-2">
          {passkeysQuery.isError ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
              دریافت لیست کلیدها ناموفق بود — دوباره تلاش کنید
            </p>
          ) : passkeysQuery.isLoading || !passkeys ? (
            [0, 1].map((i) => <Skeleton key={i} className="h-[68px] rounded-2xl" />)
          ) : passkeys.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
              هنوز Passkey ثبت نشده
            </p>
          ) : (
            passkeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Fingerprint className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{k.deviceName}</p>
                  <p className="nums mt-0.5 text-[0.62rem] text-muted-foreground">
                    {k.lastUsedAt
                      ? `آخرین استفاده: ${formatJalali(new Date(k.lastUsedAt))}`
                      : `ثبت‌شده: ${formatJalali(new Date(k.createdAt))}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePasskey(k)}
                  disabled={deletingKeyId === k.id}
                  aria-label={`حذف کلید ${k.deviceName}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {deletingKeyId === k.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
        {passkeys && passkeys.length > 0 && (
          <p className="nums mt-2 text-[0.62rem] text-muted-foreground">
            {toPersianDigits(passkeys.length)} کلید ثبت شده — با هر کدام می‌توان بدون نام کاربری و رمز وارد شد.
          </p>
        )}
      </section>

      {/* اعلان‌های Push (SEC-03) */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Bell className="size-4 text-primary" />
          اعلان‌های Push
        </div>
        <p className="mb-3 text-[0.68rem] leading-5 text-muted-foreground">
          هشدار سررسید چک و رویدادهای مالی روی همین دستگاه.
        </p>

        {isTelegram ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-[0.65rem] leading-5 text-muted-foreground">
            داخل مینی‌اپ تلگرام، اعلان‌ها از خود ربات تلگرام ارسال می‌شود و نیازی به این تنظیم نیست.
          </p>
        ) : pushCapable === false ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-[0.65rem] leading-5 text-muted-foreground">
            مرورگر این دستگاه از اعلان‌های Push پشتیبانی نمی‌کند.
          </p>
        ) : pushCapable === null ? (
          <Skeleton className="h-[76px] rounded-2xl" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3.5">
              <div className="min-w-0">
                <p className="text-xs font-bold">فعال‌سازی اعلان‌ها</p>
                <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                  {pushOn ? "فعال — اعلان‌ها به همین دستگاه می‌رسد" : "خاموش"}
                </p>
              </div>
              <Switch
                checked={pushOn}
                onCheckedChange={(checked: boolean) => (checked ? enablePush() : disablePush())}
                disabled={pushBusy}
                aria-label="فعال‌سازی اعلان‌ها"
              />
            </div>
            <Button
              onClick={testPush}
              disabled={!pushOn || testingPush}
              variant="outline"
              className="h-11 w-full rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
            >
              {testingPush ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
              ارسال اعلان آزمایشی
            </Button>
            <p className="text-[0.62rem] leading-5 text-muted-foreground">
              در iOS ابتدا اپ را به صفحه اصلی اضافه کنید (Share → Add to Home Screen) تا اعلان‌ها فعال شوند.
            </p>
          </div>
        )}
      </section>

      {/* هشدار سررسید چک */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <BellRing className="size-4 text-primary" />
          هشدار سررسید چک
        </div>
        <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
          چند روز قبل از سررسید، ربات خبر بدهد؟
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 5, 7, 10].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDueDays(d)}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                dueDays === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              {toPersianDigits(d)} روز قبل
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.62rem] text-muted-foreground">
          چک سررسید‌شده هم (پاس‌نشده) هر ساعت یک‌بار پیگیری و خبر داده می‌شود.
        </p>
      </section>

      {/* بکاپ */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <DatabaseBackup className="size-4 text-primary" />
          بکاپ و بازیابی
        </div>

        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            رمز فایل بکاپ (اختیاری)
          </label>
          <Input
            type="password"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
            placeholder="رمز اختیاری برای رمزگذاری فایل"
            dir="ltr"
            className="text-xs"
            autoComplete="new-password"
          />
          <p className="mt-2 text-[0.62rem] leading-5 text-muted-foreground">
            با رمز، فایل با AES-256 رمزگذاری می‌شود و بدون آن قابل بازگشایی نیست؛ هنگام بازیابی فایل رمزدار، همین رمز را وارد کنید.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={downloadBackup}
            disabled={backingUp}
            variant="outline"
            className="h-12 rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
          >
            {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {backupPassword.trim() ? "دانلود بکاپ رمزدار" : "دانلود بکاپ"}
          </Button>
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            className="h-12 rounded-2xl text-xs font-bold hover:bg-accent"
          >
            <Upload className="size-4" />
            بازیابی از فایل
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".db,.enc"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) restoreBackup(f)
          }}
        />
        <p className="mt-2 text-[0.62rem] text-muted-foreground">
          بکاپ خودکار روزانه هم انجام می‌شود (۷ نسخه نگهداری می‌شود).
        </p>
      </section>

      {/* ناحیه خطر */}
      <section className="rounded-3xl border border-destructive/25 bg-destructive/5 p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
          <ShieldAlert className="size-4" />
          ناحیه خطر
        </div>
        <p className="mb-3 text-[0.68rem] text-muted-foreground">
          پاک‌سازی کامل داده‌ها برای وقتی است که داده نمونه می‌خواهید دور بریزید و از صفر شروع کنید.
          همه اشخاص، اجناس، فاکتورها، چک‌ها و حساب‌ها حذف می‌شوند (تنظیمات و توکن ربات می‌ماند).
        </p>
        <Button
          onClick={() => setWipeSheet(true)}
          variant="outline"
          className="h-11 w-full rounded-2xl border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
          پاک کردن همه داده‌ها
        </Button>
      </section>

      <Button
        onClick={save}
        disabled={saving}
        className="h-13 w-full rounded-2xl py-3.5 text-sm font-bold shadow-fab"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        ذخیره تنظیمات
      </Button>

      {/* شیت تأیید پاک‌سازی */}
      <BottomSheet
        open={wipeSheet}
        onClose={() => setWipeSheet(false)}
        title="مطمئنید؟"
        description="این کار برگشت‌پذیر نیست — قبلش بکاپ بگیرید"
      >
        <div className="space-y-3">
          <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs leading-6 text-destructive">
            همه داده‌ها (اشخاص، اجناس، فاکتورها، چک‌ها، تسویه‌ها و حساب‌ها) برای همیشه حذف می‌شوند.
          </p>
          <Button
            onClick={wipe}
            disabled={wiping}
            className="h-12 w-full rounded-2xl bg-destructive font-bold hover:bg-destructive/90"
          >
            {wiping ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            بله، همه را پاک کن
          </Button>
          <Button
            onClick={() => setWipeSheet(false)}
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold"
          >
            انصراف
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}

// ───────────────────────── اتوماسیون تلگرام ─────────────────────────

const MORNING_HOURS = [6, 7, 8, 9, 10, 11]

/**
 * یادآوری صبحگاهی «چک‌های امروز» (با دکمهٔ پاس/برگشت داخل تلگرام)
 * و بکاپ خودکار رمزدار روزانه به تلگرام.
 */
function TelegramAutomation({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const ready = settings.hasBotToken && settings.hasAdminChatId

  const update = async (patch: Record<string, unknown>, okMsg: string) => {
    setBusy(Object.keys(patch)[0])
    try {
      await apiPut("/api/settings", patch)
      toast.success(okMsg)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره نشد")
    } finally {
      setBusy(null)
    }
  }

  const run = async (action: "morning" | "backup") => {
    setBusy(action)
    try {
      const r = await apiPost<{ message?: string }>("/api/telegram/action", { action })
      toast.success(r.message || "ارسال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال نشد")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Send className="size-4 -scale-x-100 text-primary" />
        خودکارهای تلگرام
      </div>
      <p className="mb-4 text-[0.7rem] leading-5 text-muted-foreground">
        {ready ? "این‌ها از طریق ربات برای خودتان ارسال می‌شوند." : "اول توکن ربات و شناسهٔ چت را بالا ذخیره کنید."}
      </p>

      {/* یادآوری صبحگاهی */}
      <div className="rounded-2xl border border-border/70 p-3.5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-warning/12 text-lg">☀️</span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.8rem] font-bold">یادآوری صبحگاهی چک‌های امروز</div>
            <div className="mt-0.5 text-[0.66rem] leading-5 text-muted-foreground">
              هر صبح فهرست چک‌های امروز و سررسیدگذشته، هر کدام با دکمهٔ «پاس شد» و «برگشت خورد» — بدون باز کردن اپ.
            </div>
          </div>
          <Switch
            checked={settings.morningReminder}
            disabled={busy !== null}
            onCheckedChange={(v) => update({ morningReminder: v }, v ? "یادآوری صبحگاهی روشن شد" : "یادآوری خاموش شد")}
          />
        </div>
        {settings.morningReminder && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed pt-3">
            <span className="me-1 text-[0.66rem] font-medium text-muted-foreground">ساعت:</span>
            {MORNING_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={busy !== null}
                onClick={() => update({ morningHour: h }, `یادآوری ساعت ${toPersianDigits(h)} صبح`)}
                className={cn(
                  "nums h-8 min-w-10 rounded-xl px-2 text-xs font-bold transition-all active:scale-95",
                  settings.morningHour === h ? "bg-primary text-primary-foreground shadow-fab" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {toPersianDigits(h)}
              </button>
            ))}
            <Button
              onClick={() => run("morning")}
              disabled={!ready || busy !== null}
              variant="ghost"
              className="ms-auto h-8 rounded-xl px-3 text-[0.68rem] font-bold text-primary hover:bg-primary/10"
            >
              {busy === "morning" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 -scale-x-100" />}
              همین حالا بفرست
            </Button>
          </div>
        )}
      </div>

      {/* بکاپ رمزدار */}
      <div className="mt-3 rounded-2xl border border-border/70 p-3.5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg">🔐</span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.8rem] font-bold">بکاپ خودکار رمزدار به تلگرام</div>
            <div className="mt-0.5 text-[0.66rem] leading-5 text-muted-foreground">
              هر شب ساعت ۳:۳۰ یک نسخهٔ رمزگذاری‌شده (AES-256) از کل داده‌ها برایتان فرستاده می‌شود. بدون رمز قابل باز شدن نیست.
            </div>
          </div>
          <Switch
            checked={settings.telegramBackup}
            disabled={busy !== null || (!settings.hasBackupPassword && password.length < 6)}
            onCheckedChange={(v) =>
              update(
                { telegramBackup: v, ...(password.length >= 6 ? { backupPassword: password } : {}) },
                v ? "بکاپ خودکار تلگرام روشن شد" : "بکاپ تلگرام خاموش شد"
              ).then(() => setPassword(""))
            }
          />
        </div>
        <div className="mt-3 space-y-2 border-t border-dashed pt-3">
          <label className="block text-[0.66rem] font-medium text-muted-foreground">
            رمز بکاپ {settings.hasBackupPassword ? "(تنظیم شده — برای تغییر رمز جدید بزنید)" : "(حداقل ۶ کاراکتر)"}
          </label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings.hasBackupPassword ? "••••••••" : "یک رمز قوی که فراموش نکنید"}
              dir="ltr"
              className="flex-1 text-sm"
              autoComplete="new-password"
            />
            {password.length >= 6 && (
              <Button
                onClick={() => update({ backupPassword: password }, "رمز بکاپ ذخیره شد").then(() => setPassword(""))}
                disabled={busy !== null}
                className="h-12 rounded-2xl px-4 text-xs font-bold"
              >
                ذخیره رمز
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.62rem] leading-4 text-warning">رمز را جایی امن نگه دارید؛ بدون آن بکاپ قابل بازیابی نیست.</p>
            <Button
              onClick={() => run("backup")}
              disabled={!ready || !settings.hasBackupPassword || busy !== null}
              variant="ghost"
              className="h-8 shrink-0 rounded-xl px-3 text-[0.68rem] font-bold text-primary hover:bg-primary/10"
            >
              {busy === "backup" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 -scale-x-100" />}
              ارسال الان
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
