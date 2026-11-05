"use client"

/**
 * تازه‌سازی خودکار با بازگشت به اپ
 *
 * focusManager خودِ React Query با visibilitychange فقط کوئری‌های «فعال و کهنه» را دوباره می‌گیرد.
 * این هوک برای بازگشت بعد از مدتی دوری (پیش‌فرض ۳۰ ثانیه) کامل‌تر عمل می‌کند:
 *  • همهٔ کوئری‌ها invalidate می‌شوند: صفحهٔ فعلی همان لحظه تازه می‌شود و صفحه‌های دیگر با باز شدن
 *  • بازگشت از bfcache (رویداد pageshow با persisted — سافاری iOS) هم حساب می‌شود
 *  • آیفون بعد از بیدار شدن چند صد میلی‌ثانیه شبکه ندارد؛ کمی صبر می‌کنیم تا درخواست‌ها خطا نخورند
 *  • سرویس‌ورکر برای نسخهٔ تازه بررسی می‌شود
 *  • رویداد `app:resume` پخش می‌شود تا جاهایی که «امروز» را از ساعت دستگاه می‌سازند دوباره رندر شوند
 */
import { useEffect } from "react"
import type { QueryClient } from "@tanstack/react-query"

export const APP_RESUME_EVENT = "app:resume"

export function useAppResume(queryClient: QueryClient, minAwayMs = 30_000) {
  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0
    let timer: number | undefined

    const resume = (away: number) => {
      if (away < minAwayMs) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ refetchType: "active" })
        navigator.serviceWorker
          ?.getRegistration()
          .then((r) => r?.update())
          .catch(() => undefined)
        window.dispatchEvent(new Event(APP_RESUME_EVENT))
      }, navigator.onLine ? 250 : 0)
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        window.clearTimeout(timer)
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      resume(away)
    }
    // bfcache: صفحه از حافظه برگشته و ممکن است ساعت‌ها کهنه باشد
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resume(Number.POSITIVE_INFINITY)
    }

    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [queryClient, minAwayMs])
}

/** برای کامپوننت‌هایی که تاریخ «امروز» را از ساعت دستگاه می‌سازند: با بازگشت به اپ دوباره رندر شوند */
export function onAppResume(cb: () => void) {
  window.addEventListener(APP_RESUME_EVENT, cb)
  return () => window.removeEventListener(APP_RESUME_EVENT, cb)
}
