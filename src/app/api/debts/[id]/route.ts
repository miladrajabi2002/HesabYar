import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { debtUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/debts/[id] — ویرایش */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, debtUpdateSchema)
    if (error) return error

    const exists = await db.debt.findUnique({ where: { id } })
    if (!exists) return fail("رکورد یافت نشد", 404)

    const debt = await db.debt.update({
      where: { id },
      data: {
        ...(data.person !== undefined ? { person: data.person } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.direction !== undefined ? { direction: data.direction } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.note !== undefined ? { note: data.note ?? null } : {}),
      },
    })
    // بازمحاسبه وضعیت تسویه پس از تغییر مبلغ
    const updated = await db.debt.findUnique({ where: { id } })
    if (updated && !updated.isSettled && updated.settledAmount >= updated.amount) {
      const final = await db.debt.update({ where: { id }, data: { isSettled: true } })
      return ok({ debt: final })
    }
    if (updated && updated.isSettled && updated.settledAmount < updated.amount) {
      const final = await db.debt.update({ where: { id }, data: { isSettled: false } })
      return ok({ debt: final })
    }
    return ok({ debt: updated })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/debts/[id] — حذف (تراکنش‌های تسویه باقی می‌مانند) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const exists = await db.debt.findUnique({ where: { id } })
    if (!exists) return fail("رکورد یافت نشد", 404)

    await db.transaction.updateMany({ where: { debtId: id }, data: { debtId: null } })
    await db.debt.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
