import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import { diffJalaliDays, endOfJalaliDay } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/**
 * GET /api/alerts — «کار امروز» برای زنگ هدر و شمارندهٔ سایدبار (نسخهٔ ۷)
 * همان معیار یادآوری صبحگاهی تلگرام: چک‌های در جریانی که سررسیدشان امروز یا گذشته است.
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
    return ok({
      dueCount: checks.length,
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
