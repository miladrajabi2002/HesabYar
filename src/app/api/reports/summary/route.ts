import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { reportQuerySchema } from "@/lib/validation"
import { getRangeTotals } from "@/lib/finance"
import { jalaliDayKey, jalaliMonthKey, jalaliToInstant, monthKeyLabel, formatJalaliShort } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** GET /api/reports/summary?from=&to= — خلاصه بازه + مقایسه با دوره قبل */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = parseQuery(req, reportQuerySchema)
    if (error) return error

    const from = new Date(data.from)
    const to = new Date(data.to)

    // دوره قبل با همان طول
    const spanMs = to.getTime() - from.getTime()
    const prevTo = new Date(from.getTime() - 1)
    const prevFrom = new Date(prevTo.getTime() - spanMs)

    const [totals, prevTotals, txs, categories] = await Promise.all([
      getRangeTotals(from, to),
      getRangeTotals(prevFrom, prevTo),
      db.transaction.findMany({
        where: { date: { gte: from, lte: to } },
        select: { type: true, amount: true, date: true, categoryId: true, note: true },
        orderBy: { date: "asc" },
      }),
      db.category.findMany(),
    ])

    // سری زمانی: روزانه برای بازه‌های کوتاه، ماهانه برای بلند
    const dayCount = Math.ceil(spanMs / 86_400_000)
    const byMonth = dayCount > 45

    const seriesMap = new Map<string, { income: number; expense: number }>()
    const catAgg = new Map<string, { amount: number; count: number }>()
    for (const t of txs) {
      if (t.type === "TRANSFER") continue
      const key = byMonth ? jalaliMonthKey(t.date) : jalaliDayKey(t.date)
      const entry = seriesMap.get(key) ?? { income: 0, expense: 0 }
      if (t.type === "INCOME") entry.income += t.amount
      else entry.expense += t.amount
      seriesMap.set(key, entry)

      if (t.type === "EXPENSE" && t.categoryId) {
        const c = catAgg.get(t.categoryId) ?? { amount: 0, count: 0 }
        c.amount += t.amount
        c.count += 1
        catAgg.set(t.categoryId, c)
      }
    }

    const series = [...seriesMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({
        key,
        label: byMonth ? monthKeyLabel(key) : formatJalaliShort(dayKeyToDate(key)),
        income: v.income,
        expense: v.expense,
      }))

    const catMap = new Map(categories.map((c) => [c.id, c]))
    const byCategory = [...catAgg.entries()]
      .map(([categoryId, v]) => ({
        categoryId,
        name: catMap.get(categoryId)?.name ?? "بدون دسته",
        color: catMap.get(categoryId)?.color ?? "#9CA3AF",
        icon: catMap.get(categoryId)?.icon ?? "CircleDollarSign",
        amount: v.amount,
        count: v.count,
        percent: totals.expense > 0 ? Math.round((v.amount / totals.expense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    return ok({
      range: { from: data.from, to: data.to, days: dayCount + 1 },
      totals,
      previous: prevTotals,
      series,
      byCategory,
    })
  } catch (e) {
    return serverError(e)
  }
}

/** تبدیل کلید روز شمسی به تاریخ */
function dayKeyToDate(key: string): Date {
  const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(key)
  if (!m) return new Date()
  return jalaliToInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0)
}
