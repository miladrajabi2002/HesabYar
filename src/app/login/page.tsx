"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Loader2, Send, LockKeyhole, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api-client"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

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
      router.replace("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ورود ناموفق بود")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-primary text-white shadow-fab">
            <Send className="size-7 -scale-x-100" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold">حساب‌یار</h1>
            <p className="mt-1 text-sm text-muted-foreground">حسابداری شخصی هوشمند شما</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card"
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

          <p className="text-center text-xs leading-6 text-muted-foreground">
            اعتبار ورود در فایل <span className="font-mono" dir="ltr">.env</span> پروژه
            (<span dir="ltr">APP_USERNAME / APP_PASSWORD</span>) قابل تغییر است.
          </p>
        </form>

        <p className="nums mt-6 text-center text-xs text-muted-foreground">{formatJalaliWithWeekday(nowTehran())}</p>
      </motion.div>
    </div>
  )
}
