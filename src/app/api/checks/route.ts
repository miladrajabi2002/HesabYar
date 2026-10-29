import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { checkFilterSchema } from "@/lib/validation"
import { checkInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/** GET /api/checks — لیست چک‌ها با فیلتر جهت/وضعیت/شخص + خلاصه */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data: f, error } = parseQuery(req, checkFilterSchema)
    if (error) return error

    const where = {
      ...(f.direction ? { direction: f.direction } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.personId ? { personId: f.personId } : {}),
    }
    const total = await db.checkPaper.count({ where })
    const checks = await db.checkPaper.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: checkInclude,
    })

    // خلاصه وضعیت کل چک‌ها
    const [pendingReceived, pendingIssued, cashedReceived, cashedIssued] = await Promise.all([
      db.checkPaper.aggregate({ where: { direction: "RECEIVED", status: "PENDING" }, _sum: { amount: true } }),
      db.checkPaper.aggregate({ where: { direction: "ISSUED", status: "PENDING" }, _sum: { amount: true } }),
      db.checkPaper.aggregate({ where: { direction: "RECEIVED", status: "CASHED" }, _sum: { amount: true } }),
      db.checkPaper.aggregate({ where: { direction: "ISSUED", status: "CASHED" }, _sum: { amount: true } }),
    ])

    return ok({
      checks,
      total,
      page: f.page,
      pageSize: f.pageSize,
      summary: {
        pendingReceived: pendingReceived._sum.amount ?? 0,
        pendingIssued: pendingIssued._sum.amount ?? 0,
        cashedReceived: cashedReceived._sum.amount ?? 0,
        cashedIssued: cashedIssued._sum.amount ?? 0,
      },
    })
  } catch (e) {
    return serverError(e)
  }
}
