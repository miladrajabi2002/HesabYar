/**
 * تنظیمات تلگرام — lib/telegram/config.ts
 * اولویت با تنظیمات ذخیره‌شده در دیتابیس است و در صورت نبود، از .env خوانده می‌شود.
 */
import { db } from "@/lib/db"

export interface TelegramConfig {
  token: string | null
  chatId: string | null
  miniAppUrl: string | null
  checkDueDaysBefore: number
}

export async function resolveTelegramConfig(): Promise<TelegramConfig> {
  const setting = await db.setting.findUnique({ where: { id: "default" } }).catch(() => null)
  return {
    token: setting?.botToken?.trim() || process.env.BOT_TOKEN?.trim() || null,
    chatId: setting?.adminChatId?.trim() || process.env.ADMIN_CHAT_ID?.trim() || null,
    miniAppUrl: setting?.miniAppUrl?.trim() || process.env.MINI_APP_URL?.trim() || null,
    checkDueDaysBefore: setting?.checkDueDaysBefore ?? 3,
  }
}

/** ماسک‌کردن توکن برای نمایش امن در کلاینت: «1234…ABCD» */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (v.length <= 8) return "••••"
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}
