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
    await startBotPolling().catch((e) => console.error("[hesabyar] خطای ربات:", e))
  }
}
