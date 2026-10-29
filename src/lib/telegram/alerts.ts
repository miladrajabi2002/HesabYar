/**
 * ارسال اعلان‌های تلگرام — lib/telegram/alerts.ts
 * همه ارسال‌ها در NotificationLog ثبت می‌شوند و جلوگیری از تکرار
 * با کلید یکتای alertType انجام می‌شود.
 */
import { db } from "@/lib/db"
import { resolveTelegramConfig } from "./config"
import { formatToman } from "@/lib/money"
import { formatJalali, diffJalaliDays, nowTehran } from "@/lib/jalali"
import { getBank } from "@/lib/banks"

export async function telegramApi(
  token: string,
  method: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    return { ok: res.ok && data.ok !== false, description: data.description }
  } catch (e) {
    return { ok: false, description: String(e) }
  }
}

/** ارسال پیام هشدار به ادمین + دکمه باز کردن مینی‌اپ + ثبت در لاگ */
export async function sendTelegramAlert(message: string, alertType: string): Promise<boolean> {
  const cfg = await resolveTelegramConfig()
  if (!cfg.token || !cfg.chatId) {
    await db.notificationLog
      .create({ data: { chatId: "-", message, alertType, status: "FAILED" } })
      .catch(() => null)
    return false
  }
  const payload: Record<string, unknown> = {
    chat_id: cfg.chatId,
    text: message,
    parse_mode: "HTML",
  }
  if (cfg.miniAppUrl && /^https:\/\//.test(cfg.miniAppUrl)) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "باز کردن حساب‌یار", web_app: { url: cfg.miniAppUrl } }]],
    }
  }
  const r = await telegramApi(cfg.token, "sendMessage", payload)
  await db.notificationLog
    .create({ data: { chatId: cfg.chatId, message, alertType, status: r.ok ? "SENT" : "FAILED" } })
    .catch(() => null)
  return r.ok
}

/** آیا این هشدار قبلاً با موفقیت ارسال شده است؟ */
export async function alreadySent(alertType: string): Promise<boolean> {
  const count = await db.notificationLog.count({ where: { alertType, status: "SENT" } }).catch(() => 0)
  return count > 0
}

/** ارسال پیام آزمایشی (صفحه تنظیمات) */
export async function sendTestMessage(): Promise<{ ok: boolean; error?: string }> {
  const cfg = await resolveTelegramConfig()
  if (!cfg.token) return { ok: false, error: "توکن ربات تنظیم نشده است" }
  if (!cfg.chatId) return { ok: false, error: "شناسه چت ادمین تنظیم نشده است" }
  const r = await telegramApi(cfg.token, "sendMessage", {
    chat_id: cfg.chatId,
    text: "✅ پیام آزمایشی «حساب‌یار فروشگاهی» با موفقیت رسید!\nاتصال ربات صحیح است.",
  })
  await db.notificationLog
    .create({ data: { chatId: cfg.chatId, message: "پیام آزمایشی", alertType: "TEST", status: r.ok ? "SENT" : "FAILED" } })
    .catch(() => null)
  return r.ok ? { ok: true } : { ok: false, error: r.description || "ارسال پیام ناموفق بود" }
}

/**
 * اسکن چک‌های در جریان و هشدار سررسید:
 *  - «چند روز مانده» (طبق تنظیم checkDueDaysBefore)
 *  - «امروز سررسید است»
 * هر چک در هر فاز فقط یک بار خبر داده می‌شود.
 */
export async function checkDueAlerts(): Promise<{ sent: number }> {
  const setting = await db.setting.findUnique({ where: { id: "default" } }).catch(() => null)
  const daysBefore = Math.max(0, Math.min(30, setting?.checkDueDaysBefore ?? 3))
  const today = nowTehran()
  const pending = await db.checkPaper.findMany({
    where: { status: "PENDING" },
    include: { person: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })

  let sent = 0
  for (const check of pending) {
    const diff = diffJalaliDays(today, check.dueDate) // منفی = گذشته
    const bank = getBank(check.bankKey)
    const dirText = check.direction === "RECEIVED" ? "دریافتی از" : "صادره به"

    // ۱) هشدار پیش از سررسید (فقط وقتی دقیقاً در پنجره هشدار است)
    if (diff >= 0 && diff <= daysBefore) {
      const key = `CHECK_DUE:${check.id}:advance`
      if (!(await alreadySent(key))) {
        const when = diff === 0 ? "امروز" : diff === 1 ? "فردا" : `${diff} روز دیگر`
        const ok = await sendTelegramAlert(
          `⏰ <b>سررسید چک ${when} است</b>\n\n` +
            `بانک: ${bank.name}\n` +
            `نوع: چک ${dirText} «${check.person.name}»\n` +
            `مبلغ: ${formatToman(check.amount)}\n` +
            `سررسید: ${formatJalali(check.dueDate)}\n` +
            (check.serial ? `سریال: <code>${check.serial}</code>\n` : "") +
            `\nبه‌موقع اقدام کنید تا چک برگشت نخورد.`,
          key
        )
        if (ok) sent++
      }
    }

    // ۲) سررسید گذشته (خرابی روز بعد)
    if (diff < 0) {
      const key = `CHECK_DUE:${check.id}:overdue`
      if (!(await alreadySent(key))) {
        const ok = await sendTelegramAlert(
          `🚨 <b>سررسید چک گذشته است</b>\n\n` +
            `بانک: ${bank.name}\n` +
            `نوع: چک ${dirText} «${check.person.name}»\n` +
            `مبلغ: ${formatToman(check.amount)}\n` +
            `سررسید: ${formatJalali(check.dueDate)}\n` +
            `${Math.abs(diff)} روز از سررسید گذشته است. پیگیری کنید.`,
          key
        )
        if (ok) sent++
      }
    }
  }
  return { sent }
}
