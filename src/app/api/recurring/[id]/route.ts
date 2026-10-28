import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { recurringUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/recurring/[id] — ویرایش/فعال‌سازی/توقف */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, recurringUpdateSchema)
    if (error) return error

    const exists = await db.recurringRule.findUnique({ where: { id } })
    if (!exists) return fail("قاعده یافت نشد", 404)

    const rule = await db.recurringRule.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId ?? null } : {}),
        ...(data.frequency !== undefined ? { frequency: data.frequency } : {}),
        ...(data.interval !== undefined ? { interval: data.interval } : {}),
        ...(data.dayOfMonth !== undefined ? { dayOfMonth: data.dayOfMonth ?? null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.startDate !== undefined ? { nextRunAt: new Date(data.startDate) } : {}),
      },
    })
    return ok({ rule })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/recurring/[id] — حذف قاعده (تراکنش‌های ایجادشده باقی می‌مانند) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const exists = await db.recurringRule.findUnique({ where: { id } })
    if (!exists) return fail("قاعده یافت نشد", 404)

    // قطع ارتباط تراکنش‌های قبلی و حذف قاعده
    await db.transaction.updateMany({ where: { recurringRuleId: id }, data: { recurringRuleId: null } })
    await db.recurringRule.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
