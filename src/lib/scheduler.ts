/**
 * زمان‌بند — lib/scheduler.ts
 * با node-cron از طریق instrumentation.ts فعال می‌شود:
 *  - هر ۵ دقیقه: پردازش تکرارشونده‌ها + بررسی هشدارها
 *  - روزانه ۰۳:۳۰: بکاپ خودکار (نگهداری ۷ نسخه)
 */
import cron from "node-cron"
import { db } from "./db"
import { processRecurringRules } from "./recurring"
import { checkBudgetAlerts, checkLowBalanceAlerts, checkDebtDueAlerts } from "./telegram/alerts"
import { createBackup, pruneBackups } from "./backup"
import { DEFAULT_CATEGORIES, DEFAULT_ALERT_RULES } from "./defaults"

const g = globalThis as unknown as { __hesabyarSchedulerStarted?: boolean }

/** مقداردهی اولیه تنظیمات، قوانین هشدار و دسته‌های پیش‌فرض (فقط اگر خالی باشند) */
export async function ensureDefaults(): Promise<void> {
  await db.setting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ...(process.env.BOT_TOKEN ? { botToken: process.env.BOT_TOKEN.trim() } : {}),
      ...(process.env.ADMIN_CHAT_ID ? { adminChatId: process.env.ADMIN_CHAT_ID.trim() } : {}),
      ...(process.env.MINI_APP_URL ? { miniAppUrl: process.env.MINI_APP_URL.trim() } : {}),
    },
  }).catch(() => null)

  for (const type of DEFAULT_ALERT_RULES) {
    const count = await db.alertRule.count({ where: { type } }).catch(() => 1)
    if (count === 0) {
      await db.alertRule.create({ data: { type, isActive: true } }).catch(() => null)
    }
  }

  const catCount = await db.category.count().catch(() => 1)
  if (catCount === 0) {
    await db.category.createMany({ data: DEFAULT_CATEGORIES }).catch(() => null)
  }
}

async function runChecks(): Promise<void> {
  await processRecurringRules()
  await checkBudgetAlerts()
  await checkLowBalanceAlerts()
  await checkDebtDueAlerts()
}

async function autoBackup(): Promise<void> {
  await createBackup()
  pruneBackups(7)
}

export async function startScheduler(): Promise<void> {
  if (g.__hesabyarSchedulerStarted) return
  g.__hesabyarSchedulerStarted = true

  try {
    await ensureDefaults()
  } catch (e) {
    console.error("[hesabyar] خطا در مقداردهی اولیه تنظیمات:", e)
  }

  cron.schedule("*/5 * * * *", () => {
    runChecks().catch((e) => console.error("[hesabyar] خطای زمان‌بند:", e))
  })
  cron.schedule("30 3 * * *", () => {
    autoBackup().catch((e) => console.error("[hesabyar] خطای بکاپ خودکار:", e))
  })

  // اجرای اولیه کمی بعد از بالا آمدن سرور
  setTimeout(() => {
    runChecks().catch((e) => console.error("[hesabyar] خطای بررسی اولیه:", e))
  }, 10_000)

  console.log("[hesabyar] ⏰ زمان‌بند فعال شد (بررسی هر ۵ دقیقه + بکاپ روزانه ۰۳:۳۰)")
}
