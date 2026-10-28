import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { transactionUpdateSchema } from "@/lib/validation"
import { txInclude } from "@/lib/includes"
import { checkBudgetAlerts } from "@/lib/telegram/alerts"

export const dynamic = "force-dynamic"

/** PATCH /api/transactions/[id] — ویرایش تراکنش */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, transactionUpdateSchema)
    if (error) return error

    const exists = await db.transaction.findUnique({ where: { id } })
    if (!exists) return fail("تراکنش یافت نشد", 404)

    if (data.accountId) {
      const account = await db.account.findUnique({ where: { id: data.accountId } })
      if (!account) return fail("حساب انتخاب‌شده یافت نشد", 400)
    }
    if (data.toAccountId) {
      const toAccount = await db.account.findUnique({ where: { id: data.toAccountId } })
      if (!toAccount) return fail("حساب مقصد یافت نشد", 400)
    }

    const nextType = data.type ?? exists.type
    const transaction = await db.transaction.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.toAccountId !== undefined ? { toAccountId: nextType === "TRANSFER" ? data.toAccountId : null } : {}),
        categoryId: nextType === "TRANSFER" ? null : data.categoryId !== undefined ? data.categoryId ?? null : undefined,
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        ...(data.note !== undefined ? { note: data.note ?? null } : {}),
      },
      include: txInclude,
    })

    if (nextType === "EXPENSE") {
      checkBudgetAlerts().catch(() => null)
    }

    return ok({ transaction })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/transactions/[id] — حذف تراکنش (موجودی‌ها زنده بازمحاسبه می‌شوند) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const exists = await db.transaction.findUnique({ where: { id } })
    if (!exists) return fail("تراکنش یافت نشد", 404)

    await db.transaction.delete({ where: { id } })
    if (exists.type === "EXPENSE") {
      checkBudgetAlerts().catch(() => null)
    }
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
