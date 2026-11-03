import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import { diffJalaliDays, endOfJalaliDay } from "@/lib/jalali"
import { getProductStocks, OVERDUE_DAYS } from "@/lib/finance"

export const dynamic = "force-dynamic"

/**
 * GET /api/alerts — «کار امروز» برای زنگ هدر و شمارندهٔ سایدبار (نسخهٔ ۷)
 * همان معیار یادآوری صبحگاهی تلگرام: چک‌های در جریانی که سررسیدشان امروز یا گذشته است.
 * به‌اضافهٔ «کار امروز» دیگر: نسیهٔ فروش معوق (بیش از ۳۰ روز) و کالاهای تمام‌شده/زیر حد هشدار.
 * عدد زنگ = چک‌ها + فاکتورهای معوق + کالاهای تمام‌شده (کم‌موجود فقط نمایش داده می‌شود).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const now = new Date()
    const checks = await db.checkPaper.findMany({
      where: { status: "PENDING", dueDate: { lte: endOfJalaliDay(now) } },
      orderBy: { dueDate: "asc" },
      take: 20,
      select: {
        id: true,
        amount: true,
        dueDate: true,
        direction: true,
        bankKey: true,
        person: { select: { name: true } },
      },
    })
    const overdueBefore = new Date(now.getTime() - OVERDUE_DAYS * 86_400_000)
    const overdue = await db.invoice.groupBy({
      by: ["type"],
      where: { credit: { gt: 0 }, date: { lt: overdueBefore }, type: "SALE" },
      _count: { _all: true },
      _sum: { credit: true },
    })
    const products = await db.product.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, unit: true, minStock: true },
    })
    const stocks = await getProductStocks()
    const lowStock = products
      .map((p) => ({ id: p.id, name: p.name, unit: p.unit, stock: stocks.get(p.id) ?? 0, minStock: p.minStock }))
      .filter((p) => p.stock <= 0 || (p.minStock > 0 && p.stock < p.minStock))
      .sort((a, b) => a.stock - b.stock)
    const outCount = lowStock.filter((p) => p.stock <= 0).length
    const overdueCount = overdue[0]?._count._all ?? 0
    return ok({
      dueCount: checks.length,
      totalCount: checks.length + overdueCount + outCount,
      overdueSales: { count: overdueCount, amount: overdue[0]?._sum.credit ?? 0, days: OVERDUE_DAYS },
      lowStock: lowStock.slice(0, 8),
      lowStockCount: lowStock.length,
      dueChecks: checks.map((c) => ({
        id: c.id,
        amount: c.amount,
        dueDate: c.dueDate,
        direction: c.direction,
        bankKey: c.bankKey,
        personName: c.person.name,
        daysLeft: diffJalaliDays(now, c.dueDate),
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}
