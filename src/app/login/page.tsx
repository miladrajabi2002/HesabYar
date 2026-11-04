"use client"

/**
 * صفحهٔ ورود (نسخهٔ ۴)
 *  • اگر کلید اثر انگشت/چهره روی سرور ثبت شده باشد، دکمهٔ بزرگ و متحرک اثر انگشت
 *    اولین چیزی است که دیده می‌شود؛ فرم رمز عبور یک لمس پایین‌تر است
 *  • بدون کلید: فرم نام کاربری/رمز مستقیم نمایش داده می‌شود
 *  • خطاها داخل خود فرم نمایش داده می‌شوند (نه با اعلان)
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Eye, EyeOff, Fingerprint, Loader2, LockKeyhole, UserRound } from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { useTelegram } from "@/hooks/use-telegram"
import { cn } from "@/lib/utils"
import { FingerprintButton, SUCCESS_MS, type ScanState } from "@/components/auth/fingerprint-button"


export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanState>("idle")
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [passkeyAvailable, setPasskeyAvailable] = useState<boolean | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { haptic } = useTelegram()
  const reduceMotion = useReducedMotion()

  // SEC-01: آیا کلید ثبت‌شده هست؟ → دکمهٔ ورود بیومتریک
  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- قابلیت مرورگر فقط بعد از mount معلوم است
      setPasskeyAvailable(false)
      return
    }
    apiGet<{ available: boolean }>("/api/passkey/login")
      .then((r) => setPasskeyAvailable(r.available))
      .catch(() => setPasskeyAvailable(false))
  }, [])

  const formVisible = passkeyAvailable === false || showForm

  const enter = () => {
    haptic.success()
    router.replace("/")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError("نام کاربری و رمز عبور را وارد کنید")
      haptic.error()
      return
    }
    setLoading(true)
    try {
      await apiPost("/api/auth/login", { username: username.trim(), password })
      enter()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ورود ناموفق بود")
      haptic.error()
      setLoading(false)
    }
  }

  /** ورود با Face ID / Touch ID / اثر انگشت */
  const loginWithPasskey = async () => {
    if (scan === "scanning") return
    setScan("scanning")
    setScanMsg(null)
    haptic.tap()
    try {
      const opts = await apiGet<{ available: boolean; options: Record<string, unknown> | null }>(
        "/api/passkey/login"
      )
      if (!opts.options) {
        setScan("error")
        setScanMsg("روی این سرور کلیدی ثبت نشده — با رمز وارد شوید")
        setShowForm(true)
        return
      }
      const assertion = await startAuthentication({ optionsJSON: opts.options as never })
      await apiPost("/api/passkey/login", { credential: assertion })
      try {
        // تنظیمات از روی همین می‌فهمد این دستگاه کلید دارد
        localStorage.setItem("hesabyar:passkey-id", assertion.id)
      } catch {
        /* حالت خصوصی */
      }
      setScan("success")
      if (reduceMotion) return enter()
      haptic.success()
      setTimeout(() => setLeaving(true), SUCCESS_MS - 220)
      setTimeout(() => router.replace("/"), SUCCESS_MS + 80)
    } catch (err) {
      setScan("error")
      haptic.error()
      if (err instanceof Error && err.name === "NotAllowedError") {
        setScanMsg("لغو شد — دوباره لمس کنید")
      } else {
        setScanMsg(err instanceof Error ? err.message : "ورود با اثر انگشت ناموفق بود")
      }
      setTimeout(() => setScan((s) => (s === "error" ? "idle" : s)), 1400)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-5 py-10">
      <LoginBackdrop />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={leaving ? { opacity: 0, y: -6, scale: 0.97, filter: "blur(6px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: leaving ? 0.3 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm sm:max-w-[25rem] sm:rounded-[1.75rem] sm:border sm:border-border sm:bg-card/90 sm:px-8 sm:py-9 sm:shadow-float sm:backdrop-blur"
      >
        <div className="mb-7 flex flex-col items-center gap-3">
          <BrandLogo size={68} />
          <div className="text-center">
            <h1 className="text-page font-black tracking-tight">حساب‌یار</h1>
            <p className="text-label text-muted-foreground">حسابداری فروشگاه شما، همیشه همراه</p>
          </div>
        </div>

        {/* ───────── ورود بیومتریک ───────── */}
        <AnimatePresence initial={false}>
          {passkeyAvailable && (
            <motion.div
              key="bio"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center"
            >
              <FingerprintButton state={scan} onPress={loginWithPasskey} />
              <div className="mt-5 min-h-12 text-center" aria-live="polite">
                <p
                  className={cn(
                    "text-title font-extrabold",
                    scan === "error" ? "text-destructive" : scan === "success" ? "text-income" : "text-foreground"
                  )}
                >
                  {scan === "scanning"
                    ? "انگشت یا چهره را تأیید کنید…"
                    : scan === "success"
                      ? "خوش آمدید"
                      : scan === "error"
                        ? (scanMsg ?? "ورود ناموفق بود")
                        : "سلام، خوش برگشتید"}
                </p>
                <p className="mt-0.5 text-label text-muted-foreground">
                  {scan === "error" ? "دوباره لمس کنید یا با رمز وارد شوید" : "برای ورود، اثر انگشت یا Face ID را تأیید کنید"}
                </p>
              </div>

              {/* اقدام اصلی با برچسب صریح؛ ورود با رمز به‌عنوان راه دوم دیده می‌شود */}
              <Button
                type="button"
                size="lg"
                onClick={loginWithPasskey}
                disabled={scan === "scanning"}
                className="mt-5 h-14 w-full rounded-2xl text-body font-bold shadow-fab"
              >
                {scan === "scanning" ? <Loader2 className="size-5 animate-spin" /> : <Fingerprint className="size-5" />}
                ورود با اثر انگشت
              </Button>
              {!showForm && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setShowForm(true)}
                  className="mt-2 h-12 w-full rounded-2xl bg-card text-label font-bold hover:bg-accent"
                >
                  ورود با رمز عبور
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ───────── فرم رمز عبور ───────── */}
        <AnimatePresence initial={false}>
          {formVisible && (
            <motion.form
              key="form"
              onSubmit={submit}
              initial={{ opacity: 0, y: 16, height: passkeyAvailable ? 0 : "auto" }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className={cn("overflow-hidden", passkeyAvailable && "mt-6")}
            >
              <div className="space-y-4 rounded-3xl border border-border bg-card p-5 sm:border-0 sm:bg-transparent sm:p-0">
                <div className="space-y-1.5">
                  <Label htmlFor="username">نام کاربری</Label>
                  <div className="relative">
                    <UserRound className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="نام کاربری"
                      className="h-12 rounded-2xl ps-10"
                      autoComplete="username"
                      autoCapitalize="none"
                      dir="ltr"
                      lang="en"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">رمز عبور</Label>
                  <div className="relative">
                    <LockKeyhole className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-12 rounded-2xl pe-11 ps-10"
                      autoComplete="current-password"
                      dir="ltr"
                      lang="en"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "پنهان کردن رمز" : "نمایش رمز"}
                      className="absolute end-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
                    >
                      {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, x: 0 }}
                      animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -3, 0] }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35 }}
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button type="submit" size="lg" className="h-12 w-full rounded-2xl text-sm font-bold shadow-fab" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  ورود به حساب‌یار
                </Button>

                {passkeyAvailable === false && (
                  <p className="text-center text-caption leading-6 text-muted-foreground">
                    بعد از ورود، از «تنظیمات ← امنیت» اثر انگشت یا چهره را فعال کنید تا دفعهٔ بعد بدون رمز وارد شوید.
                  </p>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="nums mt-7 text-center text-caption text-muted-foreground">{formatJalaliWithWeekday(nowTehran())}</p>
      </motion.div>
    </div>
  )
}

// ───────────────────────── پس‌زمینه ─────────────────────────

function LoginBackdrop() {
  // پس‌زمینهٔ آرام و ثابت: نور زمردی از بالا + دو کمان ظریف هم‌مرکز با لوگو؛ بدون لکه‌های متحرک و بافت نقطه‌ای
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(70%_100%_at_50%_0%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[40vh] bg-[linear-gradient(to_top,color-mix(in_srgb,var(--primary)_5%,transparent),transparent)]" />
      <svg className="absolute left-1/2 top-[-18vh] h-[95vh] w-[95vh] -translate-x-1/2 text-primary" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="30" stroke="currentColor" strokeOpacity="0.07" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="40" stroke="currentColor" strokeOpacity="0.05" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="49.5" stroke="currentColor" strokeOpacity="0.035" strokeWidth="0.25" />
      </svg>
    </div>
  )
}
