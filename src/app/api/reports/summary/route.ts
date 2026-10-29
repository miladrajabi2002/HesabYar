import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { periodSummary, dailySeries } from "@/lib/finance"
import {
  nowTehran,
  startOfJalaliDay,
  endOfJalaliDay,
  startOfJalaliMonth,
  endOfJalaliMonth,
  monthKeyRange,
  parseMonthKey,
} from "@/lib/jalali"
import { z } from "zod"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  period: z.enum(["day", "week", "month"]).default("month"),
  month: z
    .string()
    .regex(/^\d{3,4}-\d{1,2}$/, "قالب ماه شمسی نامعتبر است")
    .optional(),
})

/** GET /api/reports/summary?period=day|week|month&month=1405-08 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data: q, error } = parseQuery(req, querySchema)
    if (error) return error

    const now = nowTehran()
    let start: Date
    let end = endOfJalaliDay(now)

    if (q.month) {
      try {
        parseMonthKey(q.month)
      } catch {
        return fail("قالب ماه شمسی نامعتبر است", 400)
      }
      const r = monthKeyRange(q.month)
      start = r.start
      end = r.end
    } else if (q.period === "day") {
      start = startOfJalaliDay(now)
    } else if (q.period === "week") {
      const wall = new Date(now.getTime() + 3.5 * 3600_000)
      const saturdayOffset = (wall.getUTCDay() + 1) % 7
      start = new Date(startOfJalaliDay(now).getTime() - saturdayOffset * 86_400_000)
    } else {
      start = startOfJalaliMonth(now)
    }

    const [summary, series] = await Promise.all([
      periodSummary(start, end),
      // نمودار روزانه بازه (حداکثر ۶۰ روز)
      dailySeries(start, end),
    ])

    // پرفروش‌ترین اجناس و بهترین مشتری‌ها
    const items = await db.invoiceItem.findMany({
      where: { invoice: { date: { gte: start, lte: end } } },
      select: {
        productId: true,
        productName: true,
        brand: true,
        unit: true,
        quantity: true,
        unitPrice: true,
        total: true,
        costPrice: true,
        invoice: { select: { type: true, personId: true } },
      },
    })

    const topProducts = new Map<
      string,
      { name: string; brand: string | null; unit: string; qty: number; revenue: number; profit: number }
    >()
    for (const it of items) {
      if (it.invoice.type !== "SALE") continue
      const cur = topProducts.get(it.productId) || {
        name: it.productName,
        brand: it.brand,
        unit: it.unit,
        qty: 0,
        revenue: 0,
        profit: 0,
      }
      cur.qty += it.quantity
      cur.revenue += it.total
      cur.profit += (it.unitPrice - it.costPrice) * it.quantity
      topProducts.set(it.productId, cur)
    }
    const topSold = [...topProducts.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    const sales = await db.invoice.findMany({
      where: { type: "SALE", date: { gte: start, lte: end } },
      select: { personId: true, total: true },
    })
    const personIds = [...new Set(sales.map((s) => s.personId))]
    const people = await db.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
    const topCustomers = new Map<string, { name: string; total: number; count: number }>()
    for (const s of sales) {
      const name = people.find((p) => p.id === s.personId)?.name || "-"
      const cur = topCustomers.get(s.personId) || { name, total: 0, count: 0 }
      cur.total += s.total
      cur.count += 1
      topCustomers.set(s.personId, cur)
    }
    const topCustomerList = [...topCustomers.values()].sort((a, b) => b.total - a.total).slice(0, 10)

    return ok({
      start,
      end,
      summary,
      series,
      topSold,
      topCustomers: topCustomerList,
    })
  } catch (e) {
    return serverError(e)
  }
}
