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
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { useTelegram } from "@/hooks/use-telegram"
import { cn } from "@/lib/utils"

type ScanState = "idle" | "scanning" | "success" | "error"

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
      setScan("success")
      setTimeout(enter, reduceMotion ? 0 : 650)
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
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 16 }}
          >
            <BrandLogo size={76} animated />
          </motion.div>
          <div className="text-center">
            <h1 className="text-[1.7rem] font-black tracking-tight">حساب‌یار</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">حسابداری فروشگاه شما، همیشه همراه</p>
          </div>
        </div>

        {/* ───────── ورود بیومتریک ───────── */}
        <AnimatePresence initial={false}>
          {passkeyAvailable && (
            <motion.div
              key="bio"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="flex flex-col items-center"
            >
              <FingerprintButton state={scan} onPress={loginWithPasskey} />
              <div className="mt-4 h-10 text-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={scanMsg ?? scan}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={cn(
                      "text-sm font-bold",
                      scan === "error" ? "text-destructive" : scan === "success" ? "text-income" : "text-foreground"
                    )}
                  >
                    {scanMsg ??
                      (scan === "scanning"
                        ? "انگشت یا چهره را تأیید کنید…"
                        : scan === "success"
                          ? "خوش آمدید"
                          : "ورود با اثر انگشت / چهره")}
                  </motion.p>
                </AnimatePresence>
                {scan === "idle" && !scanMsg && (
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">برای ورود، دایره را لمس کنید</p>
                )}
              </div>

              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-full px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  ورود با نام کاربری و رمز
                </button>
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
              <div className="space-y-4 rounded-[1.75rem] border border-border bg-card/90 p-5 shadow-card backdrop-blur">
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
                  <p className="text-center text-[0.7rem] leading-6 text-muted-foreground">
                    بعد از ورود، از «تنظیمات ← امنیت» اثر انگشت یا چهره را فعال کنید تا دفعهٔ بعد بدون رمز وارد شوید.
                  </p>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="nums mt-8 text-center text-xs text-muted-foreground">{formatJalaliWithWeekday(nowTehran())}</p>
      </motion.div>
    </div>
  )
}

// ───────────────────────── دکمهٔ بزرگ اثر انگشت ─────────────────────────

const FP_PATHS = [
  "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
  "M14 13.12c0 2.38 0 6.38-1 8.88",
  "M17.29 21.02c.12-.6.43-2.3.5-3.02",
  "M2 12a10 10 0 0 1 18-6",
  "M2 16h.01",
  "M21.8 16c.2-2 .131-5.354 0-6",
  "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
  "M8.65 22c.21-.66.45-1.32.57-2",
  "M9 6.8a6 6 0 0 1 9 5.2v2",
]

function FingerprintButton({ state, onPress }: { state: ScanState; onPress: () => void }) {
  const reduce = useReducedMotion()
  const color =
    state === "error" ? "var(--destructive)" : state === "success" ? "var(--income)" : "var(--primary)"
  return (
    <motion.button
      type="button"
      onClick={onPress}
      aria-label="ورود با اثر انگشت یا چهره"
      whileTap={{ scale: 0.93 }}
      animate={state === "error" && !reduce ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
      style={{ ["--fp" as string]: color }}
      className="relative grid size-40 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
    >
      {/* هاله‌های تپنده */}
      {!reduce &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "color-mix(in srgb, var(--fp) 35%, transparent)" }}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
            transition={{
              duration: state === "scanning" ? 1.1 : 2.4,
              repeat: Infinity,
              delay: i * (state === "scanning" ? 0.55 : 1.2),
              ease: "easeOut",
            }}
          />
        ))}
      {/* دیسک */}
      <span
        className="absolute inset-2 rounded-full transition-colors duration-500"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--fp) 22%, var(--card)), color-mix(in srgb, var(--fp) 8%, var(--card)) 70%)",
          boxShadow:
            "0 18px 40px -12px color-mix(in srgb, var(--fp) 55%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.5), inset 0 0 0 1px color-mix(in srgb, var(--fp) 25%, transparent)",
        }}
      />
      {/* اثر انگشت */}
      <svg
        viewBox="0 0 24 24"
        className="relative size-20 overflow-visible"
        fill="none"
        stroke="var(--fp)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* لایهٔ کم‌رنگ زمینه */}
        <g opacity={0.22}>
          {FP_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {/* لایهٔ اصلی که «کشیده» می‌شود */}
        {FP_PATHS.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            initial={reduce ? false : { pathLength: 0 }}
            animate={
              state === "scanning" && !reduce
                ? { pathLength: [0.15, 1, 0.15] }
                : { pathLength: 1 }
            }
            transition={
              state === "scanning"
                ? { duration: 1.4, repeat: Infinity, delay: i * 0.06, ease: "easeInOut" }
                : { duration: 0.9, delay: 0.25 + i * 0.07, ease: [0.65, 0, 0.35, 1] }
            }
          />
        ))}
        {/* خط اسکن */}
        {state === "scanning" && !reduce && (
          <motion.line
            x1={1}
            x2={23}
            stroke="var(--fp)"
            strokeWidth={1.2}
            opacity={0.9}
            initial={{ y1: 2, y2: 2 }}
            animate={{ y1: [2, 22, 2], y2: [2, 22, 2] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
      {/* تیک موفقیت */}
      <AnimatePresence>
        {state === "success" && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute bottom-3 end-3 grid size-11 place-items-center rounded-full bg-income text-white shadow-lg ring-4 ring-background"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ───────────────────────── پس‌زمینه ─────────────────────────

function LoginBackdrop() {
  const reduce = useReducedMotion()
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent)]" />
      <motion.div
        className="absolute -start-24 -top-24 size-96 rounded-full bg-primary/[0.09] blur-3xl"
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -end-20 size-[26rem] rounded-full bg-[color:var(--hue-calendar)]/[0.07] blur-3xl"
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -25, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(color-mix(in_srgb,var(--foreground)_6%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]" />
    </div>
  )
}
