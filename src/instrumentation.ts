/**
 * Next.js Instrumentation — اجرای زمان‌بند و ربات تلگرام فقط در runtime نود
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler")
    const { startBotPolling } = await import("./lib/telegram/bot")

    try {
      startScheduler()
    } catch (e) {
      console.error("[hesabyar] خطای زمان‌بند:", e)
    }
    await startBotPolling().catch((e) => {
      console.error("[hesabyar] خطای ربات:", e)
      // تلاش مجدد بعد از ۱۰ ثانیه — بلافاصله بعد از ری‌استارت pm2 ممکن است polling
      // نسخهٔ قبلی هنوز باز باشد و تلگرام 409 بدهد؛ بعد از بسته شدن دوباره بالا می‌آید
      const t = setTimeout(() => {
        startBotPolling().catch((e2) => console.error("[hesabyar] خطای ربات (تلاش مجدد):", e2))
      }, 10_000)
      t.unref?.()
    })
  }
}
