import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { transferSchema } from "@/lib/validation"
import { dayKeyToDate, nowTehran } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** POST /api/accounts/transfer — انتقال بین دو حساب بانکی */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, transferSchema)
    if (error) return error
    if (data.fromAccountId === data.toAccountId) {
      return fail("حساب مبدأ و مقصد یکسان است", 400)
    }
    const [from, to] = await Promise.all([
      db.account.findFirst({ where: { id: data.fromAccountId, isArchived: false } }),
      db.account.findFirst({ where: { id: data.toAccountId, isArchived: false } }),
    ])
    if (!from || !to) return fail("یکی از حساب‌ها پیدا نشد", 404)

    const date = data.date ? dayKeyToDate(data.date) : nowTehran()
    const desc = data.description || `انتقال از «${from.name}» به «${to.name}»`

    await db.$transaction([
      db.transaction.create({
        data: {
          accountId: from.id,
          direction: "OUT",
          amount: data.amount,
          type: "TRANSFER",
          toAccountId: to.id,
          description: desc,
          date,
        },
      }),
      db.transaction.create({
        data: {
          accountId: to.id,
          direction: "IN",
          amount: data.amount,
          type: "TRANSFER",
          toAccountId: from.id,
          description: desc,
          date,
        },
      }),
    ])
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
