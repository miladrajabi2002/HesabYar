/**
 * زمان‌بند — lib/scheduler.ts
 * با node-cron از طریق instrumentation.ts فعال می‌شود:
 *  - هر ساعت: اسکن سررسید چک‌ها و ارسال هشدار تلگرام
 *  - روزانه ۰۳:۳۰ به وقت تهران: بکاپ خودکار (نگهداری ۷ نسخه) + ارسال رمزدار به تلگرام (اگر روشن باشد)
 *  - هر ساعت سر ساعت: اگر ساعت تهران = ساعت یادآوری، پیام «چک‌های امروز» با دکمهٔ پاس/برگشت
 */
import cron from "node-cron"
import { db } from "./db"
import { checkDueAlerts } from "./telegram/alerts"
import { createBackup, pruneBackups } from "./backup"
import { sendMorningReminder } from "./telegram/morning"
import { sendBackupToTelegram } from "./telegram/backup"

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
      const tg = await sendBackupToTelegram()
      if (tg.ok) console.log("[hesabyar] 🔐 بکاپ رمزدار به تلگرام رفت")
      else if (tg.error && tg.error !== "بکاپ تلگرام خاموش است") console.error("[hesabyar] بکاپ تلگرام:", tg.error)
    } catch (e) {
      console.error("[hesabyar] خطای بکاپ خودکار:", e)
    }
  })

  // یادآوری صبحگاهی چک‌های امروز — هر ساعت سر ساعت؛ خودش ساعت تنظیم‌شده و تکرار را چک می‌کند
  cron.schedule("0 * * * *", async () => {
    try {
      const r = await sendMorningReminder()
      if (r.sent) console.log(`[hesabyar] ☀️ یادآوری صبحگاهی (${r.count} چک) ارسال شد`)
    } catch (e) {
      console.error("[hesabyar] خطای یادآوری صبحگاهی:", e)
    }
  })

  // یک اسکن اولیه ۳۰ ثانیه بعد از بالا آمدن
  setTimeout(() => {
    checkDueAlerts().catch((e) => console.error("[hesabyar] خطای اسکن اولیه چک‌ها:", e))
  }, 30_000)

  console.log("[hesabyar] ⏰ زمان‌بند فعال شد (اسکن چک هر ساعت + یادآوری صبحگاهی + بکاپ روزانه)")
}
