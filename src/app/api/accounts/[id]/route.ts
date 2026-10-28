import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { accountUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/accounts/[id] — ویرایش حساب */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, accountUpdateSchema)
    if (error) return error

    const exists = await db.account.findUnique({ where: { id } })
    if (!exists) return fail("حساب یافت نشد", 404)

    const account = await db.account.update({ where: { id }, data })
    return ok({ account })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * DELETE /api/accounts/[id] — حذف امن
 * اگر حساب تراکنش داشته باشد، بدون action خطای 409 با تعداد تراکنش‌ها برمی‌گرداند.
 * action: DELETE_TRANSACTIONS | MOVE_TRANSACTIONS (با moveTo)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const url = new URL(req.url)
    const action = url.searchParams.get("action")
    const moveTo = url.searchParams.get("moveTo")

    const account = await db.account.findUnique({ where: { id } })
    if (!account) return fail("حساب یافت نشد", 404)

    const txCount = await db.transaction.count({
      where: { OR: [{ accountId: id }, { toAccountId: id }] },
    })

    if (txCount > 0 && !action) {
      return NextResponse.json(
        { error: "این حساب دارای تراکنش است", transactionCount: txCount },
        { status: 409 }
      )
    }

    if (txCount > 0 && action === "MOVE_TRANSACTIONS") {
      if (!moveTo) return fail("حساب مقصد برای جابه‌جایی تراکنش‌ها مشخص نشده است", 400)
      const target = await db.account.findUnique({ where: { id: moveTo } })
      if (!target) return fail("حساب مقصد یافت نشد", 404)
      if (moveTo === id) return fail("حساب مقصد نباید همان حساب حذف‌شونده باشد", 400)

      await db.transaction.updateMany({ where: { accountId: id }, data: { accountId: moveTo } })
      await db.transaction.updateMany({ where: { toAccountId: id }, data: { toAccountId: moveTo } })
      await db.recurringRule.updateMany({ where: { accountId: id }, data: { accountId: moveTo } })
    } else if (txCount > 0 && action === "DELETE_TRANSACTIONS") {
      await db.transaction.deleteMany({ where: { OR: [{ accountId: id }, { toAccountId: id }] } })
      await db.recurringRule.deleteMany({ where: { accountId: id } })
    } else if (txCount > 0) {
      return fail("نوع حذف نامعتبر است", 400)
    }

    await db.recurringRule.deleteMany({ where: { accountId: id } })
    await db.account.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
