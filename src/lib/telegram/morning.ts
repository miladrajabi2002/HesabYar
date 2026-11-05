/**
 * یادآوری صبحگاهی «چک‌های امروز» — lib/telegram/morning.ts
 *  • هر صبح (ساعت تنظیم‌شده به وقت تهران) یک پیام خلاصه + برای هر چکِ امروز/گذشته
 *    یک کارت با دکمهٔ «پاس شد» و «برگشت خورد» داخل خود تلگرام
 *  • پاس: اگر یک حساب بانکی داریم مستقیم؛ وگرنه دکمهٔ انتخاب حساب
 *  • برگشت: یک مرحله تأیید
 *  • فقط ادمین (ADMIN_CHAT_ID) مجاز به زدن دکمه‌هاست
 * منطق تغییر وضعیت همان lib/checks.ts است که API استفاده می‌کند.
 */
import type { Context } from "grammy"
import type { InlineKeyboardButton } from "grammy/types"
import { db } from "@/lib/db"
import { changeCheckStatus } from "@/lib/checks"
import { formatToman, toPersianDigits } from "@/lib/money"
import { diffJalaliDays, endOfJalaliDay, formatJalaliWithWeekday, jalaliDayKey, TEHRAN_OFFSET_MS } from "@/lib/jalali"
import { dueLabel, greeting } from "@/lib/format"
import { getBank } from "@/lib/banks"
import { resolveTelegramConfig } from "./config"
import { alreadySent, telegramApi } from "./alerts"

type InlineButton = InlineKeyboardButton
type Keyboard = InlineButton[][]

/** ساعت دیواری تهران (۰ تا ۲۳) */
export function tehranHour(d = new Date()): number {
  return new Date(d.getTime() + TEHRAN_OFFSET_MS).getUTCHours()
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}

type CheckRow = Awaited<ReturnType<typeof loadDueChecks>>[number]

async function loadDueChecks() {
  return db.checkPaper.findMany({
    where: { status: "PENDING", dueDate: { lte: endOfJalaliDay(new Date()) } },
    include: { person: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
    take: 25,
  })
}

/** متن کارت یک چک */
function checkCardText(c: CheckRow, footer?: string): string {
  const bank = getBank(c.bankKey)
  const when = dueLabel(c.dueDate)
  const dir = c.direction === "RECEIVED" ? "📥 دریافتی از" : "📤 صادره به"
  return (
    `${dir} <b>${esc(c.person.name)}</b>\n` +
    `💰 <b>${formatToman(c.amount)}</b>\n` +
    `🏦 ${esc(bank.name)}${c.serial ? ` • سریال <code>${esc(c.serial)}</code>` : ""}\n` +
    `📅 سررسید: ${formatJalaliWithWeekday(c.dueDate)} (${when})` +
    (c.isRegistered ? "" : "\n⚠️ <i>هنوز ثبت نشده — اول در اپ ثبت کنید</i>") +
    (footer ? `\n\n${footer}` : "")
  )
}

function miniAppButton(url: string | null): InlineButton[] {
  return url && /^https:\/\//.test(url) ? [{ text: "📊 باز کردن چک‌ها", web_app: { url: `${url.replace(/\/$/, "")}/checks` } }] : []
}

/** دکمه‌های پیش‌فرض کارت چک */
function checkKeyboard(c: { id: string; direction: string; isRegistered: boolean }, appUrl: string | null): Keyboard {
  if (!c.isRegistered) {
    const app = miniAppButton(appUrl)
    return app.length ? [app] : []
  }
  return [
    [
      { text: c.direction === "RECEIVED" ? "✅ پاس شد" : "✅ پرداخت شد", callback_data: `ck:p:${c.id}` },
      { text: "↩️ برگشت خورد", callback_data: `ck:b:${c.id}` },
    ],
  ]
}

/**
 * ارسال یادآوری صبحگاهی — فقط یک‌بار در روز (کلید MORNING:<روز شمسی>).
 * force: برای دکمهٔ «ارسال آزمایشی» در تنظیمات (بدون قید ساعت و تکرار)
 */
export async function sendMorningReminder(opts: { force?: boolean } = {}): Promise<{ sent: boolean; count: number; error?: string }> {
  const setting = await db.setting.findUnique({ where: { id: "default" } }).catch(() => null)
  if (!opts.force) {
    if (setting && setting.morningReminder === false) return { sent: false, count: 0 }
    if (tehranHour() !== (setting?.morningHour ?? 8)) return { sent: false, count: 0 }
  }
  const dayKey = jalaliDayKey(new Date())
  const key = `MORNING:${dayKey}`
  if (!opts.force && (await alreadySent(key))) return { sent: false, count: 0 }

  const cfg = await resolveTelegramConfig()
  if (!cfg.token || !cfg.chatId) return { sent: false, count: 0, error: "ربات یا شناسهٔ چت تنظیم نشده است" }

  const checks = await loadDueChecks()
  const today = checks.filter((c) => diffJalaliDays(new Date(), c.dueDate) === 0)
  const overdue = checks.filter((c) => diffJalaliDays(new Date(), c.dueDate) < 0)
  const sum = (arr: CheckRow[], dir: string) => arr.filter((c) => c.direction === dir).reduce((s, c) => s + c.amount, 0)

  let header = `☀️ <b>${greeting()}!</b>\n${formatJalaliWithWeekday(new Date())}\n\n`
  if (checks.length === 0) {
    header += "امروز هیچ چکی سررسید ندارد ✨\nروز خوبی داشته باشید."
  } else {
    header += `📌 <b>${toPersianDigits(today.length)} چک امروز</b>`
    if (today.length) {
      const inn = sum(today, "RECEIVED")
      const out = sum(today, "ISSUED")
      if (inn) header += `\n   📥 وصولی: ${formatToman(inn)}`
      if (out) header += `\n   📤 پرداختی: ${formatToman(out)}`
    }
    if (overdue.length) header += `\n🚨 <b>${toPersianDigits(overdue.length)} چک سررسید گذشته</b> (تعیین تکلیف نشده)`
    header += "\n\nبرای هر چک، وضعیت را همین‌جا با دکمه‌ها ثبت کنید 👇"
  }

  const first = await telegramApi(cfg.token, "sendMessage", {
    chat_id: cfg.chatId,
    text: header,
    parse_mode: "HTML",
    ...(checks.length === 0 && miniAppButton(cfg.miniAppUrl).length
      ? { reply_markup: { inline_keyboard: [miniAppButton(cfg.miniAppUrl)] } }
      : {}),
  })
  if (!first.ok) return { sent: false, count: 0, error: first.description }

  for (const c of checks) {
    await telegramApi(cfg.token, "sendMessage", {
      chat_id: cfg.chatId,
      text: checkCardText(c),
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: checkKeyboard(c, cfg.miniAppUrl) },
    })
  }

  await db.notificationLog
    .create({ data: { chatId: cfg.chatId, message: `یادآوری صبحگاهی — ${checks.length} چک`, alertType: opts.force ? "MORNING_TEST" : key, status: "SENT" } })
    .catch(() => null)
  return { sent: true, count: checks.length }
}

// ───────────────────────── دکمه‌های داخل تلگرام ─────────────────────────

/** پاسخ به دکمه‌های کارت چک — ck:<action>:<checkId>[:<accountId>] */
export async function handleCheckCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? ""
  if (!data.startsWith("ck:")) return
  const cfg = await resolveTelegramConfig()

  // فقط ادمین
  const fromId = String(ctx.from?.id ?? "")
  const chatId = String(ctx.chat?.id ?? "")
  if (!cfg.chatId || (fromId !== cfg.chatId && chatId !== cfg.chatId)) {
    await ctx.answerCallbackQuery({ text: "⛔ دسترسی ندارید", show_alert: true })
    return
  }

  const [, action, checkId, accountId] = data.split(":")
  const check = await db.checkPaper.findUnique({ where: { id: checkId }, include: { person: { select: { name: true } } } })
  if (!check) {
    await ctx.answerCallbackQuery({ text: "چک پیدا نشد (شاید حذف شده)", show_alert: true })
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => null)
    return
  }

  const edit = async (footer: string, keyboard: Keyboard = []) => {
    await ctx
      .editMessageText(checkCardText(check, footer), { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } })
      .catch(() => null)
  }

  // چک قبلاً تعیین تکلیف شده (از اپ یا دکمهٔ دیگر)
  if (check.status !== "PENDING" && action !== "x") {
    const label = check.status === "CASHED" ? "✅ قبلاً پاس شده" : check.status === "BOUNCED" ? "↩️ قبلاً برگشت خورده" : "🚫 لغو شده"
    await ctx.answerCallbackQuery({ text: label })
    await edit(`<b>${label}</b>`)
    return
  }

  // انصراف → دکمه‌های اولیه
  if (action === "x") {
    await ctx.answerCallbackQuery({ text: "لغو شد" })
    await edit("", check.status === "PENDING" ? checkKeyboard(check, cfg.miniAppUrl) : [])
    return
  }

  const accounts = await db.account.findMany({ where: { isArchived: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })

  // پاس → انتخاب حساب (اگر بیش از یکی)
  if (action === "p" || action === "pa") {
    const target = action === "pa" ? accounts.find((a) => a.id === accountId) : accounts.length === 1 ? accounts[0] : null
    if (!target) {
      if (accounts.length === 0) {
        await ctx.answerCallbackQuery({ text: "اول یک حساب بانکی در اپ اضافه کنید", show_alert: true })
        return
      }
      await ctx.answerCallbackQuery({ text: "حساب را انتخاب کنید" })
      const rows: Keyboard = accounts.slice(0, 8).map((a) => [{ text: `🏦 ${a.name}`, callback_data: `ck:pa:${check.id}:${a.id}` }])
      rows.push([{ text: "✖️ انصراف", callback_data: `ck:x:${check.id}` }])
      await edit(check.direction === "RECEIVED" ? "به کدام حساب واریز شد؟" : "از کدام حساب برداشت شد؟", rows)
      return
    }
    const r = await changeCheckStatus(check.id, { status: "CASHED", accountId: target.id })
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.error.slice(0, 190), show_alert: true })
      return
    }
    await ctx.answerCallbackQuery({ text: "✅ ثبت شد" })
    await edit(`✅ <b>${check.direction === "RECEIVED" ? "پاس شد" : "پرداخت شد"}</b> — حساب «${esc(target.name)}»`)
    return
  }

  // برگشت → تأیید
  if (action === "b") {
    await ctx.answerCallbackQuery()
    await edit("مطمئنید این چک <b>برگشت خورده</b> است؟", [
      [
        { text: "بله، برگشت خورد", callback_data: `ck:bb:${check.id}` },
        { text: "✖️ انصراف", callback_data: `ck:x:${check.id}` },
      ],
    ])
    return
  }
  if (action === "bb") {
    const r = await changeCheckStatus(check.id, { status: "BOUNCED" })
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.error.slice(0, 190), show_alert: true })
      return
    }
    await ctx.answerCallbackQuery({ text: "↩️ ثبت شد" })
    await edit(`↩️ <b>برگشت خورد</b> — مبلغ به حساب «${esc(check.person.name)}» برگشت`)
    return
  }

  await ctx.answerCallbackQuery()
}
