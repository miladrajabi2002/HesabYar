import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { budgetUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/budgets/[id] — ویرایش مبلغ/آستانه */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, budgetUpdateSchema)
    if (error) return error

    const exists = await db.budget.findUnique({ where: { id } })
    if (!exists) return fail("بودجه یافت نشد", 404)

    const budget = await db.budget.update({ where: { id }, data })
    return ok({ budget })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/budgets/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const exists = await db.budget.findUnique({ where: { id } })
    if (!exists) return fail("بودجه یافت نشد", 404)

    await db.budget.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
