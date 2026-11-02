"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { TelegramProvider } from "@/hooks/use-telegram"
import { ConfirmProvider } from "@/components/ui/confirm"
import { PWAProvider } from "@/components/pwa/pwa-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // موبایل: با باز شدن کیبورد، فیلد فوکوس‌شده در دید می‌ماند
  // (داخل باتم‌شیت‌ها فیلدهای پایینی پشت کیبورد پنهان می‌شدند)
  useEffect(() => {
    let t1: number | undefined
    let t2: number | undefined
    const scrollFocused = () => {
      const el = document.activeElement
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return
      const rect = el.getBoundingClientRect()
      const vv = window.visualViewport
      const kbTop = vv ? vv.height + vv.offsetTop : window.innerHeight
      if (rect.bottom > kbTop - 8 || rect.top < 0) {
        el.scrollIntoView({ block: "center", behavior: "smooth" })
      }
    }
    const onFocusIn = () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      t1 = window.setTimeout(scrollFocused, 300)
      t2 = window.setTimeout(scrollFocused, 800)
    }
    document.addEventListener("focusin", onFocusIn)
    window.visualViewport?.addEventListener("resize", scrollFocused)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      document.removeEventListener("focusin", onFocusIn)
      window.visualViewport?.removeEventListener("resize", scrollFocused)
    }
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TelegramProvider>
          <PWAProvider>
            <ConfirmProvider>
              {children}
              <Toaster />
            </ConfirmProvider>
          </PWAProvider>
        </TelegramProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
