/**
 * ارسال هشدارها و اعلان‌های مالی تلگرام — lib/telegram/alerts.ts
 * همه ارسال‌ها در NotificationLog ثبت می‌شوند و جلوگیری از ارسال تکراری
 * با کلید alertType انجام می‌شود.
 */
import { db } from "@/lib/db"
import { resolveTelegramConfig } from "./config"
import { formatToman, formatPercent } from "@/lib/money"
import { currentMonthKey, monthKeyLabel, monthKeyRange, formatJalali, diffJalaliDays, jalaliDayKey } from "@/lib/jalali"
import { getAccountBalances, getExpenseByCategory } from "@/lib/finance"

async function telegramApi(token: string, method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; description?: string }> {
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
    text: "✅ پیام آزمایشی حساب‌یار با موفقیت رسید!\nاتصال ربات صحیح است.",
  })
  await db.notificationLog
    .create({ data: { chatId: cfg.chatId, message: "پیام آزمایشی", alertType: "TEST", status: r.ok ? "SENT" : "FAILED" } })
    .catch(() => null)
  return r.ok ? { ok: true } : { ok: false, error: r.description || "ارسال پیام ناموفق بود" }
}

/* ---------------- بررسی‌های هشدار ---------------- */

/** هشدار عبور بودجه از آستانه (مثلاً ۸۰٪) و سقف (۱۰۰٪) — هرکدام فقط یک‌بار */
export async function checkBudgetAlerts(monthKey?: string): Promise<void> {
  const enabled = await db.alertRule.count({ where: { type: "BUDGET_THRESHOLD", isActive: true } }).catch(() => 0)
  if (!enabled) return
  const key = monthKey || currentMonthKey()
  const { start, end } = monthKeyRange(key)
  const budgets = await db.budget.findMany({ where: { monthJalali: key }, include: { category: true } })
  if (budgets.length === 0) return
  const spentMap = await getExpenseByCategory(start, end)
  for (const b of budgets) {
    if (b.amount <= 0) continue
    const spent = spentMap.get(b.categoryId) ?? 0
    const percent = (spent / b.amount) * 100
    if (percent >= 100) {
      if (await alreadySent(`BUDGET_EXCEEDED:${b.id}`)) continue
      await sendTelegramAlert(
        `⛔️ <b>بودجه «${b.category.name}» پر شد!</b>\nماه: ${monthKeyLabel(key)}\nمصرف: ${formatToman(spent)} از سقف ${formatToman(b.amount)} (${formatPercent(percent)})`,
        `BUDGET_EXCEEDED:${b.id}`
      )
    } else if (percent >= b.alertThreshold) {
      if (await alreadySent(`BUDGET_THRESHOLD:${b.id}`)) continue
      await sendTelegramAlert(
        `⚠️ <b>بودجه «${b.category.name}» به آستانه رسید</b>\nمصرف: ${formatToman(spent)} از سقف ${formatToman(b.amount)} (${formatPercent(percent)})`,
        `BUDGET_THRESHOLD:${b.id}`
      )
    }
  }
}

/** هشدار موجودی کم حساب‌ها (حداقل یک‌بار در هر روز شمسی برای هر حساب) */
export async function checkLowBalanceAlerts(): Promise<void> {
  const rules = await db.alertRule.findMany({ where: { type: "LOW_BALANCE", isActive: true } }).catch(() => [])
  if (rules.length === 0) return
  const cfg = await resolveTelegramConfig()
  const balances = await getAccountBalances()
  const accounts = await db.account.findMany({ where: { isArchived: false } })
  const dayKey = jalaliDayKey(new Date())
  const globalRule = rules.find((r) => !r.accountId)
  for (const acc of accounts) {
    const specific = rules.find((r) => r.accountId === acc.id)
    const threshold = specific?.threshold ?? globalRule?.threshold ?? cfg.lowBalanceDefault
    const balance = balances.get(acc.id) ?? 0
    if (balance < threshold) {
      const key = `LOW_BALANCE:${acc.id}:${dayKey}`
      if (await alreadySent(key)) continue
      await sendTelegramAlert(
        `📉 <b>موجودی «${acc.name}» کم است</b>\nموجودی فعلی: ${formatToman(balance)}\nحد تعیین‌شده: ${formatToman(threshold)}`,
        key
      )
    }
  }
}

/** هشدار نزدیکی سررسید بدهی/طلب (۳ روز، ۱ روز و روز سررسید) */
export async function checkDebtDueAlerts(): Promise<void> {
  const enabled = await db.alertRule.count({ where: { type: "DEBT_DUE", isActive: true } }).catch(() => 0)
  if (!enabled) return
  const now = new Date()
  const debts = await db.debt.findMany({ where: { isSettled: false, dueDate: { not: null } } })
  for (const d of debts) {
    const dueDate = d.dueDate as Date
    const days = diffJalaliDays(now, dueDate)
    for (const milestone of [3, 1, 0] as const) {
      if (days !== milestone) continue
      const key = `DEBT_DUE:${d.id}:${milestone}`
      if (await alreadySent(key)) break
      const label = d.direction === "I_OWE" ? "بدهی" : "طلب"
      const remaining = d.amount - d.settledAmount
      const msg =
        milestone === 0
          ? `🔔 <b>امروز روز سررسید ${label} است</b>\nشخص: ${d.person}\nمبلغ باقیمانده: ${formatToman(remaining)}`
          : `⏳ <b>${milestone === 1 ? "۱ روز" : "۳ روز"} تا سررسید ${label}</b>\nشخص: ${d.person}\nمبلغ باقیمانده: ${formatToman(remaining)}\nسررسید: ${formatJalali(dueDate)}`
      await sendTelegramAlert(msg, key)
      break
    }
  }
}

/** اعلان ثبت تراکنش تکرارشونده */
export async function notifyRecurringRun(rule: { id: string; title: string; type: string; amount: number }, txDate: Date): Promise<void> {
  const enabled = await db.alertRule.count({ where: { type: "RECURRING_RUN", isActive: true } }).catch(() => 1)
  if (!enabled) return
  const typeLabel = rule.type === "INCOME" ? "درآمد" : "هزینه"
  await sendTelegramAlert(
    `🔁 <b>تراکنش تکرارشونده ثبت شد</b>\n«${rule.title}»\nنوع: ${typeLabel} — مبلغ: ${formatToman(rule.amount)}\nتاریخ: ${formatJalali(txDate)}`,
    `RECURRING_RUN:${rule.id}:${txDate.getTime()}`
  )
}
