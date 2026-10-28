import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { transferCreateSchema } from "@/lib/validation"
import { txInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/** POST /api/transfers — انتقال وجه بین دو حساب (یک رکورد TRANSFER) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, transferCreateSchema)
    if (error) return error

    const [from, to] = await Promise.all([
      db.account.findUnique({ where: { id: data.fromAccountId } }),
      db.account.findUnique({ where: { id: data.toAccountId } }),
    ])
    if (!from) return fail("حساب مبدأ یافت نشد", 400)
    if (!to) return fail("حساب مقصد یافت نشد", 400)

    const transaction = await db.transaction.create({
      data: {
        type: "TRANSFER",
        amount: data.amount,
        accountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        date: new Date(data.date),
        note: data.note ?? null,
      },
      include: txInclude,
    })
    return ok({ transaction }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
