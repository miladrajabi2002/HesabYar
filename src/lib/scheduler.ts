/**
 * زمان‌بند — lib/scheduler.ts
 * با node-cron از طریق instrumentation.ts فعال می‌شود:
 *  - هر ساعت: اسکن سررسید چک‌ها و ارسال هشدار تلگرام
 *  - روزانه ۰۳:۳۰ به وقت تهران: بکاپ خودکار (نگهداری ۷ نسخه)
 */
import cron from "node-cron"
import { db } from "./db"
import { checkDueAlerts } from "./telegram/alerts"
import { createBackup, pruneBackups } from "./backup"

const g = globalThis as unknown as { __hesabyarSchedulerStarted?: boolean }

/** مقداردهی اولیه تنظیمات (فقط اگر خالی باشد) */
export async function ensureDefaults(): Promise<void> {
  await db.setting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ...(process.env.BOT_TOKEN ? { botToken: process.env.BOT_TOKEN.trim() } : {}),
      ...(process.env.ADMIN_CHAT_ID ? { adminChatId: process.env.ADMIN_CHAT_ID.trim() } : {}),
      ...(process.env.MINI_APP_URL ? { miniAppUrl: process.env.MINI_APP_URL.trim() } : {}),
      checkDueDaysBefore: 3,
    },
  }).catch(() => null)
}

export function startScheduler(): void {
  if (g.__hesabyarSchedulerStarted) return
  g.__hesabyarSchedulerStarted = true

  // اسکن سررسید چک‌ها — هر ساعت
  cron.schedule("5 * * * *", async () => {
    try {
      const r = await checkDueAlerts()
      if (r.sent > 0) console.log(`[hesabyar] ⏰ ${r.sent} هشدار سررسید چک ارسال شد`)
    } catch (e) {
      console.error("[hesabyar] خطای اسکن چک‌ها:", e)
    }
  })

  // بکاپ خودکار روزانه — ۰۳:۳۰ به وقت تهران (UTC ۲۳:۰۰ روز قبل)
  cron.schedule("0 23 * * *", async () => {
    try {
      await createBackup()
      pruneBackups(7)
      console.log("[hesabyar] 💾 بکاپ خودکار انجام شد")
    } catch (e) {
      console.error("[hesabyar] خطای بکاپ خودکار:", e)
    }
  })

  // یک اسکن اولیه ۳۰ ثانیه بعد از بالا آمدن
  setTimeout(() => {
    checkDueAlerts().catch((e) => console.error("[hesabyar] خطای اسکن اولیه چک‌ها:", e))
  }, 30_000)

  console.log("[hesabyar] ⏰ زمان‌بند فعال شد (اسکن چک هر ساعت + بکاپ روزانه)")
}
