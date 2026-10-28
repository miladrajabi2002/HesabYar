"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { apiGet } from "@/lib/api-client"
import { useTelegram } from "@/hooks/use-telegram"
import { Loader2 } from "lucide-react"

/** محافظ صفحات — در صورت نبود نشست معتبر به صفحه ورود هدایت می‌کند */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isTelegram } = useTelegram()

  const { isLoading, isError } = useQuery({
    queryKey: ["auth"],
    queryFn: () => apiGet<{ authenticated: boolean }>("/api/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!isLoading && isError && !isTelegram && pathname !== "/login") {
      router.replace("/login")
    }
  }, [isLoading, isError, isTelegram, pathname, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-fab">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-sm text-muted-foreground"
          >
            در حال بارگذاری حساب‌یار…
          </motion.p>
        </div>
      </div>
    )
  }

  if (isError && !isTelegram) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">در حال هدایت به صفحه ورود…</p>
      </div>
    )
  }

  return <>{children}</>
}
