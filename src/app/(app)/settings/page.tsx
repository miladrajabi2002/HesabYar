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
  Check,
  ChevronLeft,
  Fingerprint,
  Bell,
  Clock,
  CalendarClock,
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

/** نسخهٔ ۷ (P8): گروه‌ها به سبک تنظیمات گوشی — هر ردیف مقدار فعلی را نشان می‌دهد و جزئیات در شیت باز می‌شود */
const SETTINGS_SECTIONS = [
  { id: "security", label: "امنیت و ورود" },
  { id: "notifications", label: "اعلان‌ها" },
  { id: "telegram", label: "ربات تلگرام" },
  { id: "backup", label: "پشتیبان‌گیری" },
  { id: "danger", label: "ناحیهٔ خطر" },
] as const

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
  const [sheet, setSheet] = useState<SheetKey | null>(null)
  const [autoBusy, setAutoBusy] = useState<string | null>(null)
  const [telegramBackupPw, setTelegramBackupPw] = useState("")
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
      })
      toast.success("تنظیمات ربات ذخیره شد")
      setSheet(null)
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

  /** ذخیرهٔ فوری یک تنظیم (کلید، سوییچ، انتخاب) */
  const update = async (patch: Record<string, unknown>, okMsg: string) => {
    setAutoBusy(Object.keys(patch)[0])
    try {
      await apiPut("/api/settings", patch)
      toast.success(okMsg)
      await refetch()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره نشد")
      return false
    } finally {
      setAutoBusy(null)
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
      <div className="mx-auto max-w-4xl space-y-4">
        {[3, 2, 1].map((n) => (
          <Skeleton key={n} className="rounded-2xl" style={{ height: n * 52 }} />
        ))}
      </div>
    )
  }

  const botReady = data.hasBotToken && data.hasAdminChatId
  const pushValue = isTelegram ? "از ربات تلگرام" : pushCapable === false ? "پشتیبانی نمی‌شود" : null

  return (
    <div className="mx-auto max-w-4xl lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* دسکتاپ: فهرست بخش‌ها در ستون کنار */}
      <nav aria-label="بخش‌های تنظیمات" className="sticky top-20 hidden rounded-3xl border border-border bg-card p-2 lg:block">
        {SETTINGS_SECTIONS.map((sec, i) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className={cn(
              "flex h-[2.375rem] items-center rounded-[10px] px-3 text-sm transition-colors hover:bg-accent",
              i === 0 ? "bg-secondary font-extrabold text-secondary-foreground" : "font-medium",
              sec.id === "danger" && "text-destructive"
            )}
          >
            {sec.label}
          </a>
        ))}
      </nav>

      <div className="min-w-0">
        <PageHeader title="تنظیمات" sub="امنیت، اعلان‌ها، ربات تلگرام و پشتیبان‌گیری" />

        <SettingsGroup id="security" title="امنیت و ورود" first>
          <Cell
            icon={<Fingerprint className="size-4" />}
            label="ورود با اثر انگشت"
            value={
              passkeySupported === false
                ? "پشتیبانی نمی‌شود"
                : passkeys
                  ? passkeys.length
                    ? `${toPersianDigits(passkeys.length)} دستگاه`
                    : "فعال نیست"
                  : "…"
            }
            onClick={() => setSheet("passkey")}
          />
        </SettingsGroup>

        <SettingsGroup id="notifications" title="اعلان‌ها">
          <Cell
            icon={<Bell className="size-4" />}
            label="اعلان روی گوشی"
            value={pushValue}
            trailing={
              pushValue ? undefined : (
                <Switch
                  checked={pushOn}
                  onCheckedChange={(checked: boolean) => (checked ? enablePush() : disablePush())}
                  disabled={pushBusy || pushCapable === null}
                  aria-label="اعلان روی گوشی"
                />
              )
            }
            onClick={pushValue ? undefined : () => setSheet("push")}
          />
          <Cell
            icon={<CalendarClock className="size-4" />}
            tone="var(--hue-checks)"
            label="هشدار سررسید چک"
            value={`${toPersianDigits(data.checkDueDaysBefore)} روز قبل`}
            onClick={() => setSheet("due")}
          />
          <Cell
            icon={<Clock className="size-4" />}
            tone="var(--purchase)"
            label="یادآوری صبحگاهی چک‌ها"
            value={data.morningReminder ? `ساعت ${toPersianDigits(data.morningHour)}:۰۰` : "خاموش"}
            onClick={() => setSheet("morning")}
          />
        </SettingsGroup>

        <SettingsGroup id="telegram" title="ربات تلگرام">
          <Cell
            icon={<Send className="size-4 -scale-x-100" />}
            tone="#2a8bd0"
            label="اتصال ربات"
            trailing={
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold",
                  botReady ? "bg-income/10 text-income" : "bg-warning/15 text-warning-ink"
                )}
              >
                {botReady ? <Check className="size-3" /> : null}
                {botReady ? "وصل است" : data.hasBotToken ? "شناسهٔ چت لازم است" : "وصل نیست"}
              </span>
            }
            onClick={() => setSheet("telegram")}
          />
        </SettingsGroup>

        <SettingsGroup id="backup" title="پشتیبان‌گیری">
          <Cell
            icon={<DatabaseBackup className="size-4" />}
            label="بکاپ خودکار رمزدار در تلگرام"
            value={data.telegramBackup ? "هر شب ۳:۳۰" : "خاموش"}
            onClick={() => setSheet("tgBackup")}
          />
          <Cell icon={<Download className="size-4" />} label="دانلود بکاپ" onClick={() => setSheet("download")} />
          <Cell icon={<Upload className="size-4" />} label="بازیابی از فایل" onClick={() => setSheet("restore")} />
        </SettingsGroup>

        <SettingsGroup id="danger" title="ناحیهٔ خطر" danger>
          <Cell
            icon={<Trash2 className="size-4" />}
            tone="var(--destructive)"
            label="پاک کردن همهٔ داده‌ها"
            danger
            onClick={() => setWipeSheet(true)}
          />
        </SettingsGroup>
        <p className="mt-3 px-1 text-caption text-muted-foreground">بکاپ خودکار روزانه روی سرور هم گرفته می‌شود (۷ نسخهٔ آخر نگه داشته می‌شود).</p>
      </div>

      {/* ───────── شیت: ورود با اثر انگشت ───────── */}
      <BottomSheet
        open={sheet === "passkey"}
        onClose={() => setSheet(null)}
        title="ورود با اثر انگشت"
        description="با اثر انگشت یا Face ID بدون رمز وارد شوید"
        footer={
          passkeySupported !== false ? (
            <Button onClick={registerPasskey} disabled={passkeyBusy} className="h-12 w-full rounded-2xl font-bold">
              {passkeyBusy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
              افزودن این دستگاه
            </Button>
          ) : undefined
        }
      >
        {passkeySupported !== false ? (
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{k.deviceName}</p>
                    <p className="nums text-caption text-muted-foreground">
                      {k.lastUsedAt
                        ? `آخرین استفاده: ${formatJalali(new Date(k.lastUsedAt))}`
                        : `ثبت‌شده: ${formatJalali(new Date(k.createdAt))}`}
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
      </BottomSheet>

      {/* ───────── شیت: اعلان روی گوشی ───────── */}
      <BottomSheet
        open={sheet === "push"}
        onClose={() => setSheet(null)}
        title="اعلان روی گوشی"
        description={pushOn ? "فعال — اعلان‌ها به همین دستگاه می‌رسد" : "خاموش"}
        footer={
          <Button onClick={testPush} disabled={!pushOn || testingPush} variant="outline" className="h-12 w-full rounded-2xl font-bold">
            {testingPush ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            ارسال اعلان آزمایشی
          </Button>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-border">
          <Cell
            label="دریافت اعلان روی این دستگاه"
            trailing={
              <Switch
                checked={pushOn}
                onCheckedChange={(checked: boolean) => (checked ? enablePush() : disablePush())}
                disabled={pushBusy}
                aria-label="دریافت اعلان روی این دستگاه"
              />
            }
          />
        </div>
        <p className="mt-3 px-1 text-caption leading-5 text-muted-foreground">
          در iOS ابتدا اپ را به صفحهٔ اصلی اضافه کنید (Share → Add to Home Screen) تا اعلان‌ها فعال شوند.
        </p>
      </BottomSheet>

      {/* ───────── شیت: هشدار سررسید چک ───────── */}
      <BottomSheet
        open={sheet === "due"}
        onClose={() => setSheet(null)}
        title="هشدار سررسید چک"
        description="چند روز قبل از سررسید، ربات خبر بدهد؟"
        desktopMode="dialog"
      >
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 5, 7, 10].map((d) => (
            <button
              key={d}
              type="button"
              disabled={autoBusy !== null}
              onClick={async () => {
                if (await update({ checkDueDaysBefore: d }, `هشدار ${toPersianDigits(d)} روز قبل از سررسید`)) setSheet(null)
              }}
              className={cn(
                "h-12 rounded-2xl border text-sm font-bold transition-colors",
                data.checkDueDaysBefore === d
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-border bg-card hover:bg-accent"
              )}
            >
              {toPersianDigits(d)} روز قبل
            </button>
          ))}
        </div>
        <p className="mt-3 px-1 text-caption leading-5 text-muted-foreground">
          چک سررسیدشده هم (تا وقتی پاس یا برگشت نخورده) هر ساعت یک‌بار پیگیری و خبر داده می‌شود.
        </p>
      </BottomSheet>

      {/* ───────── شیت: یادآوری صبحگاهی ───────── */}
      <BottomSheet
        open={sheet === "morning"}
        onClose={() => setSheet(null)}
        title="یادآوری صبحگاهی"
        description="هر صبح فهرست چک‌های امروز و سررسیدگذشته با دکمهٔ «پاس شد» و «برگشت خورد» در تلگرام"
        footer={
          <Button
            onClick={() => runTelegram("morning")}
            disabled={!botReady || autoBusy !== null}
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold"
          >
            {autoBusy === "morning" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
            همین حالا بفرست
          </Button>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-border">
          <Cell
            label="یادآوری روشن باشد"
            trailing={
              <Switch
                checked={data.morningReminder}
                disabled={autoBusy !== null}
                onCheckedChange={(v) => update({ morningReminder: v }, v ? "یادآوری صبحگاهی روشن شد" : "یادآوری خاموش شد")}
                aria-label="یادآوری روشن باشد"
              />
            }
          />
        </div>
        {data.morningReminder && (
          <>
            <h3 className="mx-1 mb-2 mt-4 text-label font-extrabold text-foreground/80">ساعت ارسال</h3>
            <div className="grid grid-cols-6 gap-1.5">
              {MORNING_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={autoBusy !== null}
                  onClick={() => update({ morningHour: h }, `یادآوری ساعت ${toPersianDigits(h)} صبح`)}
                  className={cn(
                    "nums h-11 rounded-xl border text-sm font-bold transition-colors",
                    data.morningHour === h ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"
                  )}
                >
                  {toPersianDigits(h)}
                </button>
              ))}
            </div>
          </>
        )}
        {!botReady && <p className="mt-3 px-1 text-caption font-bold text-warning-ink">اول ربات تلگرام را وصل کنید.</p>}
      </BottomSheet>

      {/* ───────── شیت: ربات تلگرام ───────── */}
      <BottomSheet
        open={sheet === "telegram"}
        onClose={() => setSheet(null)}
        title="اتصال ربات تلگرام"
        description="برای ثبت سریع از تلگرام، یادآوری‌ها و بکاپ خودکار"
        footer={
          <div className="grid gap-2">
            <Button onClick={save} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              ذخیره
            </Button>
            <Button
              onClick={testTelegram}
              disabled={testing || !botReady}
              variant="ghost"
              className="h-10 w-full rounded-2xl text-label font-bold text-primary"
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
              ارسال پیام آزمایشی
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <FieldGroup
            label="توکن ربات"
            hint={data.hasBotToken ? `فعال (${data.botTokenMasked}) — از ${data.botTokenSource === "db" ? "دیتابیس" : "env"}` : undefined}
          >
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={data.hasBotToken ? "برای تغییر، توکن جدید را وارد کنید" : "123456:ABC-DEF…"}
              dir="ltr"
              className="font-mono text-sm"
            />
          </FieldGroup>
          <FieldGroup label="شناسهٔ چت ادمین (Chat ID)">
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="مثلاً ۱۲۵۳۹۳۹۸۲۸" dir="ltr" className="nums font-mono" />
          </FieldGroup>
          <FieldGroup label="آدرس مینی‌اپ" hint="دکمهٔ «باز کردن حساب‌یار» داخل ربات">
            <Input value={miniAppUrl} onChange={(e) => setMiniAppUrl(e.target.value)} placeholder="https://hesabyar.miladrajabi.com" dir="ltr" />
          </FieldGroup>
        </div>
      </BottomSheet>

      {/* ───────── شیت: بکاپ خودکار تلگرام ───────── */}
      <BottomSheet
        open={sheet === "tgBackup"}
        onClose={() => setSheet(null)}
        title="بکاپ خودکار در تلگرام"
        description="هر شب ساعت ۳:۳۰ یک نسخهٔ رمزگذاری‌شده (AES-256) از کل داده‌ها"
        footer={
          <Button
            onClick={() => runTelegram("backup")}
            disabled={!botReady || !data.hasBackupPassword || autoBusy !== null}
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold"
          >
            {autoBusy === "backup" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
            ارسال بکاپ همین حالا
          </Button>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-border">
          <Cell
            label="بکاپ خودکار روشن باشد"
            trailing={
              <Switch
                checked={data.telegramBackup}
                disabled={autoBusy !== null || (!data.hasBackupPassword && telegramBackupPw.length < 6)}
                onCheckedChange={(v) =>
                  update(
                    { telegramBackup: v, ...(telegramBackupPw.length >= 6 ? { backupPassword: telegramBackupPw } : {}) },
                    v ? "بکاپ خودکار تلگرام روشن شد" : "بکاپ تلگرام خاموش شد"
                  ).then(() => setTelegramBackupPw(""))
                }
                aria-label="بکاپ خودکار روشن باشد"
              />
            }
          />
        </div>
        <FieldGroup
          className="mt-4"
          label="رمز بکاپ"
          hint={data.hasBackupPassword ? "تنظیم شده — برای تغییر، رمز جدید بزنید" : "حداقل ۶ کاراکتر"}
        >
          <div className="flex gap-2">
            <Input
              type="password"
              value={telegramBackupPw}
              onChange={(e) => setTelegramBackupPw(e.target.value)}
              placeholder={data.hasBackupPassword ? "••••••••" : "یک رمز قوی که فراموش نکنید"}
              dir="ltr"
              className="flex-1"
              autoComplete="new-password"
            />
            {telegramBackupPw.length >= 6 && (
              <Button
                onClick={() => update({ backupPassword: telegramBackupPw }, "رمز بکاپ ذخیره شد").then(() => setTelegramBackupPw(""))}
                disabled={autoBusy !== null}
                className="h-12 rounded-2xl px-4 font-bold"
              >
                ذخیره
              </Button>
            )}
          </div>
        </FieldGroup>
        <p className="mt-2 px-1 text-caption font-bold text-warning-ink">رمز را جایی امن نگه دارید؛ بدون آن بکاپ قابل بازیابی نیست.</p>
      </BottomSheet>

      {/* ───────── شیت: دانلود / بازیابی بکاپ ───────── */}
      <BottomSheet
        open={sheet === "download" || sheet === "restore"}
        onClose={() => setSheet(null)}
        title={sheet === "restore" ? "بازیابی از فایل" : "دانلود بکاپ"}
        description={
          sheet === "restore"
            ? "داده‌های فعلی با محتوای فایل جایگزین می‌شود"
            : "یک نسخه از همهٔ داده‌ها روی همین دستگاه ذخیره می‌شود"
        }
        footer={
          sheet === "restore" ? (
            <Button onClick={() => fileRef.current?.click()} className="h-12 w-full rounded-2xl font-bold">
              <Upload className="size-4" />
              انتخاب فایل بکاپ
            </Button>
          ) : (
            <Button onClick={downloadBackup} disabled={backingUp} className="h-12 w-full rounded-2xl font-bold">
              {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {backupPassword.trim() ? "دانلود بکاپ رمزدار" : "دانلود بکاپ"}
            </Button>
          )
        }
      >
        <FieldGroup
          label={sheet === "restore" ? "رمز فایل (اگر رمزدار است)" : "رمز فایل (اختیاری)"}
          hint={sheet === "restore" ? undefined : "با رمز، فایل با AES-256 رمزگذاری می‌شود و بدون آن باز نمی‌شود"}
        >
          <Input
            type="password"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
            placeholder={sheet === "restore" ? "فقط برای فایل .enc" : "رمز اختیاری"}
            dir="ltr"
            autoComplete="new-password"
          />
        </FieldGroup>
      </BottomSheet>
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
    </div>
  )
}

// ───────────────────────── اجزای فهرست تنظیمات ─────────────────────────

type SheetKey = "passkey" | "push" | "due" | "morning" | "telegram" | "tgBackup" | "download" | "restore"

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
