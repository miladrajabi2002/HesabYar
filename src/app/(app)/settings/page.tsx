"use client"

/**
 * تنظیمات — ربات تلگرام، ورود بیومتریک (Passkey)، اعلان‌های Push،
 * هشدار سررسید چک، بکاپ/بازیابی (با رمز اختیاری SEC-08)، پاک‌سازی داده
 */
import { SettingsSkeleton } from "@/components/ui/page-skeletons"
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
  Check,
  ChevronLeft,
  Fingerprint,
  Bell,
  Clock,
  CalendarClock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
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
import { PageHeader } from "@/components/layout/page-header"
import { SettingsLayout, type SettingsSection } from "@/components/settings/settings-layout"
import { InstallButton, usePWA } from "@/components/pwa/pwa-provider"

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
  password: { source: "app" | "env"; changedAt: string | null }
}

const PASSKEY_LOCAL = "hesabyar:passkey-id"

interface PasskeyItem {
  id: string
  deviceName: string
  credentialId: string
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
  // کدام شیت جزئیات باز است (نسخهٔ ۷: فرم‌ها در شیت، نه وسط صفحه)
  const [pwOpen, setPwOpen] = useState(false)
  const { isStandalone } = usePWA()
  const [autoBusy, setAutoBusy] = useState<string | null>(null)
  const pendingSaves = useRef(0)
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
  // شناسهٔ کلید همین مرورگر (بعد از ثبت یا ورود با اثر انگشت) — دکمهٔ «افزودن این دستگاه» دوباره نمی‌آید
  const [thisDevice, setThisDevice] = useState<string | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setThisDevice(window.localStorage.getItem(PASSKEY_LOCAL))
      } catch {
        /* حالت خصوصی */
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [])
  const rememberDevice = (id: string) => {
    try {
      window.localStorage.setItem(PASSKEY_LOCAL, id)
    } catch {
      /* حالت خصوصی */
    }
    setThisDevice(id)
  }

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
      rememberDevice(attestation.id)
      toast.success(r.message || "کلید با موفقیت ثبت شد")
      setDeviceName("")
      await queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    } catch (err) {
      if (err instanceof Error && (err.name === "InvalidStateError" || /already registered|previously registered/i.test(err.message))) {
        // کلید این دستگاه از قبل روی سرور هست (excludeCredentials)
        rememberDevice("registered")
        toast.info("این دستگاه از قبل ثبت شده است — با همان اثر انگشت وارد شوید")
      } else if (err instanceof Error && err.name === "NotAllowedError") {
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
      if (k.credentialId === thisDevice) {
        try {
          window.localStorage.removeItem(PASSKEY_LOCAL)
        } catch {
          /* */
        }
        setThisDevice(null)
      }
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
  // رمز فایل فقط برای بازیابی بکاپ‌های قدیمی که با رمز دیگری ساخته شده‌اند
  const [backupPassword, setBackupPassword] = useState("")
  const [backingUp, setBackingUp] = useState(false)

  const downloadBackup = async () => {
    setBackingUp(true)
    try {
      // fetch → blob → دانلود؛ فایل با رمز ورود قفل است
      const res = await fetch("/api/backup", {
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
      toast.success("بکاپ دانلود شد — با رمز ورود باز می‌شود")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "دانلود بکاپ ناموفق بود")
    } finally {
      setBackingUp(false)
    }
  }

  const restoreBackup = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    // فایل رمزدار خودکار با رمز ورود باز می‌شود؛ این رمز فقط برای فایل‌های قدیمی است
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
      })
      toast.success("تنظیمات ربات ذخیره شد")
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

  /**
   * ذخیرهٔ فوری یک تنظیم (کلید، سوییچ، انتخاب) — خوش‌بینانه: سوییچ همان لحظهٔ لمس جابه‌جا می‌شود، نه
   * بعد از رفت‌وبرگشت PUT و GET، و بقیهٔ سوییچ‌ها هم وسط ذخیره کم‌رنگ و قفل نمی‌شوند. اگر ذخیره نشد
   * فقط کلیدهای همین درخواست برمی‌گردند. تا ذخیره‌ای در راه است دوباره نمی‌خوانیم.
   */
  const update = async (patch: Record<string, unknown>, okMsg: string) => {
    const before = queryClient.getQueryData<Settings>(["settings"])
    const keys = Object.keys(patch).filter((k) => before && k in before)
    if (before && keys.length) {
      await queryClient.cancelQueries({ queryKey: ["settings"] })
      queryClient.setQueryData<Settings>(["settings"], (cur) => (cur ? { ...cur, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) } : cur))
    }
    pendingSaves.current++
    try {
      await apiPut("/api/settings", patch)
      toast.success(okMsg)
      return true
    } catch (e) {
      if (before) queryClient.setQueryData<Settings>(["settings"], (cur) => (cur ? { ...cur, ...Object.fromEntries(keys.map((k) => [k, before[k as keyof Settings]])) } : cur))
      toast.error(e instanceof Error ? e.message : "ذخیره نشد")
      return false
    } finally {
      if (--pendingSaves.current === 0) void refetch()
    }
  }

  const runTelegram = async (action: "morning" | "backup") => {
    setAutoBusy(action)
    try {
      const r = await apiPost<{ message?: string }>("/api/telegram/action", { action })
      toast.success(r.message || "ارسال شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال نشد")
    } finally {
      setAutoBusy(null)
    }
  }

  if (data) {
    // مقداردهی اولیه فرم‌ها
    if (chatId === "" && data.adminChatId) setChatId(data.adminChatId)
    if (miniAppUrl === "" && data.miniAppUrl) setMiniAppUrl(data.miniAppUrl)
  }

  if (isLoading || !data) {
    return (
      <SettingsSkeleton />
    )
  }

  const botReady = data.hasBotToken && data.hasAdminChatId
  const pushValue = isTelegram ? "از ربات تلگرام" : pushCapable === false ? "پشتیبانی نمی‌شود" : null
  const deviceKey = passkeys?.find((k) => k.credentialId === thisDevice) ?? null
  const registeredHere = !!deviceKey || thisDevice === "registered"
  const fullBtn = "h-12 w-full rounded-2xl font-bold"

  const sections: SettingsSection[] = [
    {
      id: "security",
      label: "امنیت و ورود",
      icon: <ShieldCheck className="size-4" />,
      description: "اثر انگشت و رمز ورود",
      items: [
        {
          id: "passkey",
          icon: <Fingerprint className="size-4" />,
          label: "ورود با اثر انگشت",
          description: "با اثر انگشت یا Face ID بدون رمز وارد شوید",
          value: passkeySupported === false ? "پشتیبانی نمی‌شود" : registeredHere ? "این دستگاه فعال است" : passkeys ? (passkeys.length ? `${toPersianDigits(passkeys.length)} دستگاه` : "فعال نیست") : "…",
          wide: true,
          content: (
            <>
              {registeredHere ? (
                <div className="flex items-center gap-2.5 rounded-2xl bg-income/10 px-3.5 py-3 text-label font-bold text-income">
                  <CheckCircle2 className="size-5 shrink-0" />
                  این دستگاه ثبت شده{deviceKey ? ` (${deviceKey.deviceName})` : ""}؛ دفعهٔ بعد فقط اثر انگشت.
                </div>
              ) : passkeySupported !== false ? (
                <FieldGroup label="نام این دستگاه (اختیاری)">
                  <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="مثلاً: آیفون شخصی" />
                </FieldGroup>
              ) : (
                <p className="rounded-2xl bg-muted px-4 py-3 text-caption leading-5 text-muted-foreground">
                  مرورگر این دستگاه از ورود بیومتریک (WebAuthn) پشتیبانی نمی‌کند — با کروم، سافاری یا اپ نصب‌شده امتحان کنید.
                </p>
              )}
              <h3 className="mx-1 mb-2 mt-4 text-label font-extrabold text-foreground/80">دستگاه‌های ثبت‌شده</h3>
              <div className="overflow-hidden rounded-2xl border border-border">
                {passkeysQuery.isError ? (
                  <p className="px-4 py-5 text-center text-label text-muted-foreground">دریافت فهرست ناموفق بود — دوباره تلاش کنید</p>
                ) : passkeysQuery.isLoading || !passkeys ? (
                  <Skeleton className="m-3 h-10 rounded-xl" />
                ) : passkeys.length === 0 ? (
                  <p className="px-4 py-5 text-center text-label text-muted-foreground">هنوز دستگاهی ثبت نشده</p>
                ) : (
                  <div className="divide-y divide-border">
                    {passkeys.map((k) => (
                      <div key={k.id} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
                        <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                            {k.deviceName}
                            {k.credentialId === thisDevice && <span className="rounded-full bg-income/12 px-1.5 text-micro font-extrabold text-income">همین دستگاه</span>}
                          </p>
                          <p className="nums text-caption text-muted-foreground">
                            {k.lastUsedAt ? `آخرین استفاده: ${formatJalali(new Date(k.lastUsedAt))}` : `ثبت‌شده: ${formatJalali(new Date(k.createdAt))}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePasskey(k)}
                          disabled={deletingKeyId === k.id}
                          aria-label={`حذف ${k.deviceName}`}
                          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {deletingKeyId === k.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ),
          footer:
            passkeySupported !== false && !registeredHere ? (
              <Button onClick={registerPasskey} disabled={passkeyBusy} className={fullBtn}>
                {passkeyBusy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
                افزودن این دستگاه
              </Button>
            ) : undefined,
        },
        {
          id: "password",
          icon: <KeyRound className="size-4" />,
          tone: "var(--purchase)",
          label: "رمز ورود و بکاپ",
          value: data.password.source === "app" ? "تغییر داده شده" : "رمز اولیه",
          onClick: () => setPwOpen(true),
        },
      ],
    },
    {
      id: "notifications",
      label: "اعلان‌ها",
      icon: <Bell className="size-4" />,
      tone: "var(--purchase)",
      description: "اعلان گوشی، سررسید چک و یادآوری صبح",
      items: [
        {
          id: "push",
          icon: <Bell className="size-4" />,
          label: "اعلان روی گوشی",
          description: pushOn ? "فعال — اعلان‌ها به همین دستگاه می‌رسد" : "در iOS ابتدا اپ را به صفحهٔ اصلی اضافه کنید (Share → Add to Home Screen)",
          value: pushValue,
          trailing: pushValue ? undefined : (
            <Switch checked={pushOn} onCheckedChange={(checked: boolean) => (checked ? enablePush() : disablePush())} disabled={pushBusy || pushCapable === null} aria-label="اعلان روی گوشی" />
          ),
          content: pushValue ? undefined : (
            <p className="text-caption leading-6 text-muted-foreground">سررسید چک‌ها، کارهای امروز و پیگیری‌ها به‌صورت نوتیفیکیشن روی همین دستگاه می‌آیند.</p>
          ),
          footer: pushValue ? undefined : (
            <Button onClick={testPush} disabled={!pushOn || testingPush} variant="outline" className={fullBtn}>
              {testingPush ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
              ارسال اعلان آزمایشی
            </Button>
          ),
        },
        {
          id: "due",
          icon: <CalendarClock className="size-4" />,
          tone: "var(--hue-checks)",
          label: "هشدار سررسید چک",
          description: "چند روز قبل از سررسید خبر بدهد؟ چک سررسیدشده هم تا پاس یا برگشت پیگیری می‌شود.",
          value: `${toPersianDigits(data.checkDueDaysBefore)} روز قبل`,
          content: (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[1, 2, 3, 5, 7, 10].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={autoBusy !== null}
                  onClick={() => update({ checkDueDaysBefore: d }, `هشدار ${toPersianDigits(d)} روز قبل از سررسید`)}
                  className={cn(
                    "h-11 rounded-2xl border text-sm font-bold transition-colors",
                    data.checkDueDaysBefore === d ? "border-primary bg-secondary text-secondary-foreground" : "border-border bg-card hover:bg-accent"
                  )}
                >
                  {toPersianDigits(d)} روز
                </button>
              ))}
            </div>
          ),
        },
        {
          id: "morning",
          icon: <Clock className="size-4" />,
          tone: "var(--purchase)",
          label: "یادآوری صبحگاهی چک‌ها",
          description: "هر صبح چک‌های امروز و سررسیدگذشته با دکمهٔ «پاس شد» و «برگشت خورد» در تلگرام",
          value: data.morningReminder ? `ساعت ${toPersianDigits(data.morningHour)}:۰۰` : "خاموش",
          trailing: (
            <Switch
              checked={data.morningReminder}
              disabled={autoBusy !== null}
              onCheckedChange={(v) => update({ morningReminder: v }, v ? "یادآوری صبحگاهی روشن شد" : "یادآوری خاموش شد")}
              aria-label="یادآوری صبحگاهی"
            />
          ),
          content: (
            <>
              {data.morningReminder ? (
                <div className="grid grid-cols-6 gap-1.5">
                  {MORNING_HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={autoBusy !== null}
                      onClick={() => update({ morningHour: h }, `یادآوری ساعت ${toPersianDigits(h)} صبح`)}
                      className={cn("nums h-11 rounded-xl border text-sm font-bold transition-colors", data.morningHour === h ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent")}
                    >
                      {toPersianDigits(h)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-caption text-muted-foreground">با سوییچ بالا روشنش کنید تا ساعت ارسال را انتخاب کنید.</p>
              )}
              {!botReady && <p className="mt-3 px-1 text-caption font-bold text-warning-ink">اول ربات تلگرام را وصل کنید.</p>}
            </>
          ),
          footer: (
            <Button onClick={() => runTelegram("morning")} disabled={!botReady || autoBusy !== null} variant="outline" className={fullBtn}>
              {autoBusy === "morning" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
              همین حالا بفرست
            </Button>
          ),
        },
      ],
    },
    {
      id: "telegram",
      label: "ربات تلگرام",
      icon: <Send className="size-4 -scale-x-100" />,
      tone: "#2a8bd0",
      description: "ثبت سریع از تلگرام، یادآوری‌ها و بکاپ خودکار",
      items: [
        {
          id: "bot",
          icon: <Send className="size-4 -scale-x-100" />,
          tone: "#2a8bd0",
          label: "اتصال ربات",
          wide: true,
          value: botReady ? "وصل است" : data.hasBotToken ? "شناسهٔ چت لازم است" : "وصل نیست",
          content: (
            <div className="grid gap-3 lg:grid-cols-2">
              <FieldGroup label="توکن ربات" hint={data.hasBotToken ? `فعال (${data.botTokenMasked}) — از ${data.botTokenSource === "db" ? "دیتابیس" : "env"}` : undefined} className="lg:col-span-2">
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder={data.hasBotToken ? "برای تغییر، توکن جدید را وارد کنید" : "123456:ABC-DEF…"} dir="ltr" className="font-mono text-sm" />
              </FieldGroup>
              <FieldGroup label="شناسهٔ چت ادمین (Chat ID)">
                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="مثلاً ۱۲۵۳۹۳۹۸۲۸" dir="ltr" className="nums font-mono" />
              </FieldGroup>
              <FieldGroup label="آدرس مینی‌اپ" hint="دکمهٔ «باز کردن حساب‌یار» داخل ربات">
                <Input value={miniAppUrl} onChange={(e) => setMiniAppUrl(e.target.value)} placeholder="https://hesabyar.miladrajabi.com" dir="ltr" />
              </FieldGroup>
            </div>
          ),
          footer: (
            <div className="grid gap-2">
              <Button onClick={testTelegram} disabled={testing || !botReady} variant="ghost" className="h-10 w-full rounded-2xl text-label font-bold text-primary">
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
                ارسال پیام آزمایشی
              </Button>
              <Button onClick={save} disabled={saving || (!token.trim() && chatId === (data.adminChatId ?? "") && miniAppUrl === (data.miniAppUrl ?? ""))} className={fullBtn}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                ذخیره
              </Button>
            </div>
          ),
        },
      ],
    },
    {
      id: "backup",
      label: "پشتیبان‌گیری و نصب",
      icon: <DatabaseBackup className="size-4" />,
      tone: "#64748b",
      description: "بکاپ رمزدار، بازیابی و نصب روی صفحهٔ اصلی",
      items: [
        {
          id: "tgBackup",
          icon: <DatabaseBackup className="size-4" />,
          label: "بکاپ خودکار رمزدار در تلگرام",
          description: "هر شب ساعت ۳:۳۰ یک نسخهٔ رمزگذاری‌شده (AES-256) با رمز ورود",
          value: data.telegramBackup ? "هر شب ۳:۳۰" : "خاموش",
          trailing: (
            <Switch
              checked={data.telegramBackup}
              disabled={autoBusy !== null}
              onCheckedChange={(v) => update({ telegramBackup: v }, v ? "بکاپ خودکار تلگرام روشن شد" : "بکاپ تلگرام خاموش شد")}
              aria-label="بکاپ خودکار تلگرام"
            />
          ),
          content: (
            <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3.5 py-3 text-caption leading-6 text-muted-foreground">
              <KeyRound className="mt-1 size-4 shrink-0" />
              فایل‌ها با <b className="text-foreground">رمز ورود</b> قفل می‌شوند؛ رمز جدا لازم نیست.
            </p>
          ),
          footer: (
            <Button onClick={() => runTelegram("backup")} disabled={!botReady || autoBusy !== null} variant="outline" className={fullBtn}>
              {autoBusy === "backup" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
              ارسال بکاپ همین حالا
            </Button>
          ),
        },
        {
          id: "download",
          icon: <Download className="size-4" />,
          label: "دانلود بکاپ",
          description: "یک نسخه از همهٔ داده‌ها، قفل با رمز ورود",
          content: (
            <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3.5 py-3 text-label leading-6 text-muted-foreground">
              <KeyRound className="mt-1 size-4 shrink-0" />
              فایل با AES-256 و <b className="text-foreground">رمز ورود</b> شما قفل می‌شود و بدون آن باز نمی‌شود.
            </p>
          ),
          footer: (
            <Button onClick={downloadBackup} disabled={backingUp} className={fullBtn}>
              {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              دانلود بکاپ رمزدار
            </Button>
          ),
        },
        {
          id: "restore",
          icon: <Upload className="size-4" />,
          label: "بازیابی از فایل",
          description: "داده‌های فعلی با محتوای فایل جایگزین می‌شود",
          content: (
            <FieldGroup label="رمز فایل قدیمی (اختیاری)" hint="فایل‌های تازه خودکار با رمز ورود باز می‌شوند؛ فقط اگر بکاپ با رمز دیگری ساخته شده، آن را بزنید">
              <Input type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} placeholder="خالی بگذارید" dir="ltr" autoComplete="off" />
            </FieldGroup>
          ),
          footer: (
            <Button onClick={() => fileRef.current?.click()} variant="outline" className={fullBtn}>
              <Upload className="size-4" />
              انتخاب فایل بکاپ
            </Button>
          ),
        },
        {
          id: "install",
          icon: <Smartphone className="size-4" />,
          tone: isStandalone ? "var(--income)" : "#64748b",
          label: "نصب روی صفحهٔ اصلی",
          description: "تمام‌صفحه، سریع‌تر و با اعلان",
          value: isTelegram ? "داخل تلگرام" : isStandalone ? "نصب‌شده ✓" : "نصب نشده",
          hidden: isTelegram,
          content: isStandalone ? (
            <div className="flex items-center gap-2.5 rounded-2xl bg-income/10 px-3.5 py-3 text-label font-bold text-income">
              <CheckCircle2 className="size-5" /> همین الان از اپ نصب‌شده باز کرده‌اید.
            </div>
          ) : (
            <div className="space-y-3 text-caption leading-6 text-muted-foreground">
              <p>در آیفون: سافاری ← Share ← Add to Home Screen. در اندروید و دسکتاپ: «Install app» از منوی مرورگر یا دکمهٔ زیر.</p>
              <InstallButton />
            </div>
          ),
        },
      ],
    },
    {
      id: "danger",
      label: "ناحیهٔ خطر",
      danger: true,
      icon: <Trash2 className="size-4" />,
      description: "پاک‌سازی برگشت‌ناپذیر",
      items: [{ id: "wipe", icon: <Trash2 className="size-4" />, label: "پاک کردن همهٔ داده‌ها", danger: true, onClick: () => setWipeSheet(true) }],
    },
  ]

  return (
    <>
      <SettingsLayout
        sections={sections}
        header={<PageHeader title="تنظیمات" sub="امنیت، اعلان‌ها، ربات تلگرام و پشتیبان‌گیری" />}
        mobileFooter={<p className="mt-3 px-1 text-caption text-muted-foreground">بکاپ خودکار روزانه روی سرور هم گرفته می‌شود (۷ نسخهٔ آخر نگه داشته می‌شود).</p>}
        asideFooter={<p className="px-2 text-caption leading-5 text-muted-foreground">بکاپ خودکار روزانه روی سرور هم گرفته می‌شود (۷ نسخهٔ آخر).</p>}
      />
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

      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => queryClient.invalidateQueries({ queryKey: ["settings"] })} />

      {/* شیت تأیید پاک‌سازی — پیامد را صریح می‌گوید */}
      <BottomSheet
        open={wipeSheet}
        onClose={() => setWipeSheet(false)}
        title="پاک کردن همهٔ داده‌ها"
        description="این کار برگشت‌پذیر نیست — قبلش بکاپ بگیرید"
        desktopMode="dialog"
        footer={
          <div className="grid gap-2">
            <Button onClick={wipe} disabled={wiping} variant="destructive" className="h-12 w-full rounded-2xl font-bold">
              {wiping ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              بله، همه را پاک کن
            </Button>
            <Button onClick={() => setWipeSheet(false)} variant="ghost" className="h-11 w-full rounded-2xl font-bold">
              انصراف
            </Button>
          </div>
        }
      >
        <ul className="space-y-1.5 rounded-2xl bg-destructive/[0.07] px-4 py-3 text-label text-destructive">
          <li>همهٔ اشخاص، کالاها، فاکتورها، چک‌ها، تسویه‌ها و حساب‌ها برای همیشه حذف می‌شوند.</li>
          <li className="text-muted-foreground">تنظیمات، کلیدهای ورود و توکن ربات باقی می‌مانند.</li>
        </ul>
      </BottomSheet>
    </>
  )
}

// ───────────────────────── اجزای فهرست تنظیمات ─────────────────────────


const MORNING_HOURS = [6, 7, 8, 9, 10, 11]

function SettingsGroup({
  id,
  title,
  children,
  first = false,
  danger = false,
}: {
  id: string
  title: string
  children: React.ReactNode
  first?: boolean
  danger?: boolean
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-24">
      <h2 className={cn("mx-1 mb-2 text-label font-extrabold", first ? "mt-0" : "mt-5", danger ? "text-destructive" : "text-foreground/80")}>
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  )
}

/** ردیف تنظیمات به سبک گوشی — آیکون، عنوان، مقدار فعلی، و فلش (یا سوییچ) */
function Cell({
  icon,
  tone = "var(--primary)",
  label,
  value,
  trailing,
  onClick,
  danger = false,
}: {
  icon?: React.ReactNode
  tone?: string
  label: string
  value?: string | null
  trailing?: React.ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  const body = (
    <>
      {icon && (
        <span
          className="grid size-[1.875rem] shrink-0 place-items-center rounded-[9px]"
          style={{ color: tone, background: `color-mix(in srgb, ${tone} 11%, white)` }}
        >
          {icon}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", danger && "font-bold text-destructive")}>{label}</span>
      {value && <span className="nums shrink-0 text-label text-muted-foreground">{value}</span>}
      {trailing}
      {onClick && !trailing && <ChevronLeft className="size-4 shrink-0 text-muted-foreground/70" />}
    </>
  )
  const cls = "flex min-h-[3.125rem] w-full items-center gap-2.5 px-3.5 text-start"
  // ردیف با سوییچ: کلیک روی متن شیت جزئیات را باز می‌کند، سوییچ مستقل است
  if (onClick && trailing) {
    return (
      <div className={cls}>
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
          {icon && (
            <span
              className="grid size-[1.875rem] shrink-0 place-items-center rounded-[9px]"
              style={{ color: tone, background: `color-mix(in srgb, ${tone} 11%, white)` }}
            >
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
        </button>
        {trailing}
      </div>
    )
  }
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-accent/50", danger && "hover:bg-destructive/5")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function FieldGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-label font-bold text-foreground/80">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-caption leading-5 text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** تغییر رمز: همین رمز، رمز ورود و رمز همهٔ فایل‌های بکاپ است */
function PasswordSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ current: "", next: "", repeat: "" })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = () => {
    setF({ current: "", next: "", repeat: "" })
    onClose()
  }
  const strength = Math.min(4, [f.next.length >= 8, f.next.length >= 12, /[0-9]/.test(f.next) && /[a-zA-Z]/.test(f.next), /[^a-zA-Z0-9]/.test(f.next)].filter(Boolean).length)
  const mismatch = !!f.repeat && f.repeat !== f.next
  const save = async () => {
    if (f.next.length < 8) return toast.error("رمز تازه حداقل ۸ کاراکتر باشد")
    if (f.next !== f.repeat) return toast.error("تکرار رمز یکی نیست")
    setBusy(true)
    try {
      await apiPost("/api/settings/password", { current: f.current, next: f.next })
      toast.success("رمز عوض شد — ورود و بکاپ‌ها از این به بعد با رمز تازه است")
      onDone()
      close()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "رمز عوض نشد")
    } finally {
      setBusy(false)
    }
  }
  const field = (key: "current" | "next" | "repeat", label: string, auto: string) => (
    <FieldGroup label={label}>
      <Input
        type={show ? "text" : "password"}
        value={f[key]}
        onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))}
        autoComplete={auto}
        dir="ltr"
        aria-invalid={key === "repeat" && mismatch ? true : undefined}
      />
    </FieldGroup>
  )
  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="رمز ورود و بکاپ"
      description="یک رمز برای ورود و قفل همهٔ فایل‌های بکاپ (دانلود و تلگرام)"
      desktopMode="dialog"
      footer={
        <Button onClick={save} disabled={busy || !f.current || !f.next || mismatch} className="h-12 w-full rounded-2xl font-bold">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          ذخیرهٔ رمز تازه
        </Button>
      }
    >
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void save())}>
        <input type="text" autoComplete="username" className="hidden" readOnly value="" />
        {field("current", "رمز فعلی", "current-password")}
        {field("next", "رمز تازه", "new-password")}
        <div className="flex items-center gap-1 px-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < strength ? (strength >= 3 ? "bg-income" : strength === 2 ? "bg-warning" : "bg-destructive") : "bg-muted")} />
          ))}
        </div>
        {field("repeat", "تکرار رمز تازه", "new-password")}
        {mismatch && <p className="px-1 text-caption font-bold text-destructive">تکرار رمز با رمز تازه یکی نیست</p>}
        <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1.5 px-1 text-label font-bold text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {show ? "پنهان کردن رمز" : "نمایش رمز"}
        </button>
        <p className="rounded-2xl bg-muted/60 px-3.5 py-3 text-caption leading-6 text-muted-foreground">
          بکاپ‌هایی که از این به بعد ساخته می‌شوند با رمز تازه قفل می‌شوند. فایل‌های قدیمی‌تر را موقع بازیابی با رمز قبلی‌شان باز کنید.
        </p>
      </form>
    </BottomSheet>
  )
}
