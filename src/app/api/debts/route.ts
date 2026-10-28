import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { debtCreateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** GET /api/debts — لیست بدهی‌ها و طلب‌ها */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const debts = await db.debt.findMany({
      include: { settledTransactions: { orderBy: { date: "desc" }, take: 10 } },
      orderBy: { isSettled: "asc" },
    })
    return ok({
      debts: debts.map((d) => ({
        ...d,
        remaining: d.amount - d.settledAmount,
        settledTransactions: d.settledTransactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          date: t.date,
          note: t.note,
          accountId: t.accountId,
        })),
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/debts — ثبت بدهی/طلب جدید */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, debtCreateSchema)
    if (error) return error

    const debt = await db.debt.create({
      data: {
        direction: data.direction,
        person: data.person,
        amount: data.amount,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        note: data.note ?? null,
      },
    })
    return ok({ debt }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
