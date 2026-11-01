"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Loader2, Send, LockKeyhole, UserRound, Fingerprint } from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { useTelegram } from "@/hooks/use-telegram"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyAvailable, setPasskeyAvailable] = useState<boolean | null>(null)
  const { haptic } = useTelegram()

  // SEC-01: بررسی وجود کلید ثبت‌شده — دکمه ورود بیومتریک
  useState(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setPasskeyAvailable(false)
      return
    }
    apiGet<{ available: boolean }>("/api/passkey/login")
      .then((r) => setPasskeyAvailable(r.available))
      .catch(() => setPasskeyAvailable(false))
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error("نام کاربری و رمز عبور را وارد کنید")
      return
    }
    setLoading(true)
    try {
      await apiPost("/api/auth/login", { username: username.trim(), password })
      toast.success("خوش آمدید! 🌿")
      haptic.success()
      router.replace("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ورود ناموفق بود")
      haptic.error()
    } finally {
      setLoading(false)
    }
  }

  /** ورود با Face ID / Touch ID — مثل همراه بانک مسکن */
  const loginWithPasskey = async () => {
    setPasskeyLoading(true)
    try {
      // گزینه‌های چالش از سرور
      const opts = await apiGet<{ available: boolean; options: Record<string, unknown> | null }>(
        "/api/passkey/login"
      )
      if (!opts.options) {
        toast.error("کلیدی ثبت نشده است — اول با نام کاربری وارد شوید")
        return
      }
      const assertion = await startAuthentication({ optionsJSON: opts.options as never })
      await apiPost("/api/passkey/login", { credential: assertion })
      toast.success("خوش آمدید! 🔑")
      haptic.success()
      router.replace("/")
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.info("تأیید بیومتریک لغو شد")
      } else {
        toast.error(err instanceof Error ? err.message : "ورود با کلید ناموفق بود")
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* موشن‌گرافیک پس‌زمینه (MO-06) — حباب‌های شیشه‌ای سبز */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-24 -start-24 size-96 rounded-full bg-primary/[0.07] blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -end-20 size-[26rem] rounded-full bg-primary/[0.05] blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -25, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute start-1/2 top-1/3 size-40 rounded-full bg-warning/[0.05] blur-2xl"
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* کارت‌های شناور کوچک — نماد فاکتور و چک */}
        <motion.div
          className="absolute end-[12%] top-[18%] hidden rounded-2xl border border-border/60 bg-card/80 p-3 shadow-card backdrop-blur sm:block"
          animate={{ y: [0, -12, 0], rotate: [3, 5, 3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-2 text-[0.6rem] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-income" /> فروش امروز
            <span className="nums font-bold text-foreground">۱٫۲م</span>
          </div>
        </motion.div>
        <motion.div
          className="absolute start-[10%] bottom-[22%] hidden rounded-2xl border border-border/60 bg-card/80 p-3 shadow-card backdrop-blur sm:block"
          animate={{ y: [0, 10, 0], rotate: [-4, -2, -4] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-2 text-[0.6rem] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-warning" /> سررسید چک
            <span className="font-bold text-foreground">۳ روز</span>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
            className="flex size-16 items-center justify-center rounded-3xl bg-primary text-white shadow-fab"
          >
            <Send className="size-7 -scale-x-100" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold">حساب‌یار</h1>
            <p className="mt-1 text-sm text-muted-foreground">حسابداری فروشگاه شما</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-3xl border border-border bg-card/95 p-6 shadow-card backdrop-blur"
        >
          <div className="space-y-1.5">
            <Label htmlFor="username">نام کاربری</Label>
            <div className="relative">
              <UserRound className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری"
                className="ps-9"
                autoComplete="username"
                dir="ltr"
                lang="en"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">رمز عبور</Label>
            <div className="relative">
              <LockKeyhole className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="ps-9"
                autoComplete="current-password"
                dir="ltr"
                lang="en"
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            ورود به حساب‌یار
          </Button>

          {/* SEC-01: ورود با Passkey — Face ID / Touch ID */}
          {passkeyAvailable && (
            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.65rem] text-muted-foreground">یا</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          {passkeyAvailable && (
            <Button
              type="button"
              onClick={loginWithPasskey}
              disabled={passkeyLoading}
              variant="outline"
              size="lg"
              className="w-full rounded-xl border-primary/40 font-bold text-primary hover:bg-primary/10"
            >
              {passkeyLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Fingerprint className="size-5" />
              )}
              ورود با اثر انگشت / چهره
            </Button>
          )}

          <p className="text-center text-xs leading-6 text-muted-foreground">
            {passkeyAvailable
              ? "کلید شما روی همین دستگاه ذخیره شده — بدون نام کاربری و رمز وارد شوید."
              : "بعد از اولین ورود، از تنظیمات کلید اثر انگشت/چهره بسازید تا دیگر رمز نزنید."}
          </p>
        </form>

        <p className="nums mt-6 text-center text-xs text-muted-foreground">{formatJalaliWithWeekday(nowTehran())}</p>
      </motion.div>
    </div>
  )
}
