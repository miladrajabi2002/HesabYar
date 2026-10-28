/**
 * پردازش تراکنش‌های تکرارشونده — lib/recurring.ts
 * در هر اجرا، همه دوره‌های عقب‌افتاده تا اکنون catch-up می‌شوند و
 * برای تکرار ماهانه، روز ماه شمسی حفظ می‌شود.
 */
import { db } from "./db"
import { jalaliOf, jalaliToInstant, jalaliMonthLengthOf } from "./jalali"
import { notifyRecurringRun } from "./telegram/alerts"

interface RuleLike {
  id: string
  title: string
  type: string
  amount: number
  accountId: string
  categoryId: string | null
  frequency: string
  interval: number
  dayOfMonth: number | null
  isActive: boolean
  nextRunAt: Date
}

const DAY_MS = 86_400_000

/** زمان اجرای بعدی یک قاعده را از یک اجرای قبلی محاسبه می‌کند (همیشه بعد از from است) */
export function advanceNextRun(rule: Pick<RuleLike, "frequency" | "interval" | "dayOfMonth">, from: Date): Date {
  const iv = Math.max(1, rule.interval || 1)
  if (rule.frequency === "DAILY") {
    return new Date(from.getTime() + iv * DAY_MS)
  }
  if (rule.frequency === "WEEKLY") {
    return new Date(from.getTime() + iv * 7 * DAY_MS)
  }
  // MONTHLY_JALALI — حفظ روز ماه شمسی با کلمپ به طول ماه
  const j = jalaliOf(from)
  const total = j.jy * 12 + (j.jm - 1) + iv
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const day = Math.min(rule.dayOfMonth ?? j.jd, jalaliMonthLengthOf(ny, nm))
  return jalaliToInstant(ny, nm, day, 12, 0, 0)
}

async function createRuleTransaction(rule: RuleLike, date: Date) {
  const tx = await db.transaction.create({
    data: {
      type: rule.type,
      amount: rule.amount,
      accountId: rule.accountId,
      categoryId: rule.type === "TRANSFER" ? null : rule.categoryId,
      date,
      note: rule.title,
      recurringRuleId: rule.id,
    },
  })
  await notifyRecurringRun(rule, tx.date).catch(() => null)
  return tx
}

export interface ProcessResult {
  created: number
  rules: number
}

/**
 * پردازش قواعد تکرارشونده.
 * - بدون گزینه: همه قواعد فعالِ سررسیدشده catch-up می‌شوند.
 * - با ruleId و force: یک اجرای دستی فوری برای همان قاعده.
 */
export async function processRecurringRules(options?: { ruleId?: string; force?: boolean }): Promise<ProcessResult> {
  const now = new Date()
  const rules: RuleLike[] = options?.ruleId
    ? ((await db.recurringRule.findMany({ where: { id: options.ruleId } })) as RuleLike[])
    : ((await db.recurringRule.findMany({ where: { isActive: true, nextRunAt: { lte: now } } })) as RuleLike[])

  let created = 0
  for (const rule of rules) {
    try {
      if (options?.force) {
        await createRuleTransaction(rule, now)
        created++
        const next = advanceNextRun(rule, now)
        await db.recurringRule.update({ where: { id: rule.id }, data: { nextRunAt: next, lastRunAt: now } })
        continue
      }
      if (!rule.isActive) continue

      let next = rule.nextRunAt
      let guard = 0
      while (next.getTime() <= now.getTime() && guard < 400) {
        await createRuleTransaction(rule, next)
        created++
        guard++
        next = advanceNextRun(rule, next)
      }
      if (guard >= 400) {
        // محافظ ایمنی: پرش به اولین دوره آینده
        while (next.getTime() <= now.getTime()) next = advanceNextRun(rule, next)
      }
      await db.recurringRule.update({ where: { id: rule.id }, data: { nextRunAt: next, lastRunAt: now } })
    } catch (e) {
      console.error(`[hesabyar] خطا در پردازش قاعده تکرارشونده ${rule.id}:`, e)
    }
  }
  return { created, rules: rules.length }
}
