import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { recurringCreateSchema } from "@/lib/validation"
import { FREQUENCY_LABELS } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** GET /api/recurring — قواعد تکرارشونده با تاریخچه اجرا */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const rules = await db.recurringRule.findMany({
      include: {
        account: { select: { id: true, name: true, color: true, icon: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
        generated: { orderBy: { date: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "asc" },
    })

    const counts = await db.transaction.groupBy({
      by: ["recurringRuleId"],
      where: { recurringRuleId: { not: null } },
      _count: { _all: true },
    })
    const countMap = new Map(counts.map((c) => [c.recurringRuleId, c._count._all]))

    return ok({
      rules: rules.map((r) => ({
        ...r,
        runCount: countMap.get(r.id) ?? 0,
        frequencyLabel: FREQUENCY_LABELS[r.frequency as keyof typeof FREQUENCY_LABELS] ?? r.frequency,
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/recurring — ایجاد قاعده تکرارشونده */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, recurringCreateSchema)
    if (error) return error

    const account = await db.account.findUnique({ where: { id: data.accountId } })
    if (!account) return fail("حساب یافت نشد", 400)
    if (data.categoryId) {
      const category = await db.category.findUnique({ where: { id: data.categoryId } })
      if (!category) return fail("دسته یافت نشد", 400)
    }

    const rule = await db.recurringRule.create({
      data: {
        title: data.title,
        type: data.type,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        frequency: data.frequency,
        interval: data.interval,
        dayOfMonth: data.dayOfMonth ?? null,
        nextRunAt: new Date(data.startDate),
        isActive: true,
      },
    })
    return ok({ rule }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
