import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { accountUpdateSchema } from "@/lib/validation"
import { getAccountBalance } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** PATCH /api/accounts/[id] — ویرایش/بایگانی حساب */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const { data, error } = await parseBody(req, accountUpdateSchema)
    if (error) return error
    const exists = await db.account.findUnique({ where: { id } })
    if (!exists) return fail("حساب پیدا نشد", 404)
    const account = await db.account.update({ where: { id }, data })
    return ok({ account, balance: await getAccountBalance(id) })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/accounts/[id] — فقط حساب بدون گردش */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const txCount = await db.transaction.count({ where: { accountId: id } })
    const invCount = await db.invoice.count({ where: { accountId: id } })
    if (txCount + invCount > 0) return fail("این حساب گردش دارد؛ فقط می‌توانید بایگانی‌اش کنید", 400)
    await db.account.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
