/**
 * ربات تلگرام (حالت polling) — lib/telegram/bot.ts
 * وظیفه: ارسال هشدارها + پیام خوش‌آمد با دکمه باز کردن مینی‌اپ
 *        + دکمه‌های پاس/برگشت چک در یادآوری صبحگاهی (callback_query)
 */
import { Bot, InlineKeyboard } from "grammy"
import { resolveTelegramConfig } from "./config"
import { handleCheckCallback, sendMorningReminder } from "./morning"

const g = globalThis as unknown as { __hesabyarBot?: Bot; __hesabyarBotTried?: boolean }

export async function startBotPolling(): Promise<void> {
  if (g.__hesabyarBot || g.__hesabyarBotTried) return
  g.__hesabyarBotTried = true

  const cfg = await resolveTelegramConfig()
  if (!cfg.token) {
    console.log("[hesabyar] 🤖 ربات تلگرام غیرفعال است (توکن تنظیم نشده)")
    return
  }

  const bot = new Bot(cfg.token)

  bot.command("start", async (ctx) => {
    const kb =
      cfg.miniAppUrl && /^https:\/\//.test(cfg.miniAppUrl)
        ? new InlineKeyboard().webApp("📊 باز کردن حساب‌یار", cfg.miniAppUrl)
        : undefined
    await ctx.reply(
      "سلام! به «حساب‌یار فروشگاهی» خوش آمدید 👋\n\nاین ربات هشدارهای فروشگاه شما را ارسال می‌کند:\n• نزدیک شدن سررسید چک‌های دریافت‌شده\n• سررسید چک‌های صادره\n• گذشتن سررسید بدون پاس\n• هر صبح: چک‌های امروز با دکمهٔ پاس/برگشت (یا دستور /today)\n\nبرای کار با حساب‌ها، فاکتورها و گزارش‌ها، اپ را باز کنید:",
      kb ? { reply_markup: kb } : {}
    )
  })

  // دکمه‌های کارت چک (یادآوری صبحگاهی)
  bot.on("callback_query:data", async (ctx) => {
    try {
      await handleCheckCallback(ctx)
    } catch (e) {
      console.error("[hesabyar-bot] خطای دکمهٔ چک:", e)
      await ctx.answerCallbackQuery({ text: "خطا — دوباره تلاش کنید" }).catch(() => null)
    }
  })

  // دستور /today — همان یادآوری صبحگاهی، هر وقت لازم شد
  bot.command("today", async (ctx) => {
    if (String(ctx.chat.id) !== (await resolveTelegramConfig()).chatId) return
    await sendMorningReminder({ force: true })
  })

  bot.catch((err) => {
    console.error("[hesabyar-bot] خطا:", err.error ?? err)
  })

  // حذف وبهوک احتمالی برای اطمینان از کارکرد polling
  await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => null)

  bot
    .start({
      drop_pending_updates: true,
      onStart: (me) => console.log(`[hesabyar] 🤖 ربات @${me.username} با polling فعال شد`),
    })
    .catch((e) => {
      console.error("[hesabyar-bot] خطای راه‌اندازی polling:", e?.message ?? e)
      g.__hesabyarBot = undefined
      g.__hesabyarBotTried = false
    })

  g.__hesabyarBot = bot
}

export function stopBotPolling(): void {
  g.__hesabyarBot?.stop()
  g.__hesabyarBot = undefined
  g.__hesabyarBotTried = false
}

export function isBotRunning(): boolean {
  return !!g.__hesabyarBot
}
