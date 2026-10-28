import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { categoryUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/categories/[id] — ویرایش دسته */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, categoryUpdateSchema)
    if (error) return error

    const exists = await db.category.findUnique({ where: { id } })
    if (!exists) return fail("دسته یافت نشد", 404)

    const category = await db.category.update({ where: { id }, data })
    return ok({ category })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * DELETE /api/categories/[id] — حذف امن دسته
 * بدون action و با تراکنش → 409 همراه تعداد. action: CLEAR_CATEGORY | MOVE_TRANSACTIONS (با moveTo)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const url = new URL(req.url)
    const action = url.searchParams.get("action")
    const moveTo = url.searchParams.get("moveTo")

    const category = await db.category.findUnique({ where: { id } })
    if (!category) return fail("دسته یافت نشد", 404)

    const txCount = await db.transaction.count({ where: { categoryId: id } })
    const budgetCount = await db.budget.count({ where: { categoryId: id } })

    if (txCount > 0 && !action) {
      return NextResponse.json(
        { error: "این دسته دارای تراکنش است", transactionCount: txCount },
        { status: 409 }
      )
    }

    if (txCount > 0 && action === "MOVE_TRANSACTIONS") {
      if (!moveTo) return fail("دسته مقصد مشخص نشده است", 400)
      const target = await db.category.findUnique({ where: { id: moveTo } })
      if (!target) return fail("دسته مقصد یافت نشد", 404)
      if (target.type !== category.type) return fail("دسته مقصد باید هم‌نوع (درآمد/هزینه) باشد", 400)
      await db.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: moveTo } })
    } else if (txCount > 0 && action === "CLEAR_CATEGORY") {
      await db.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
    } else if (txCount > 0) {
      return fail("نوع حذف نامعتبر است", 400)
    }

    // بودجه‌های وابسته به این دسته حذف می‌شوند
    await db.budget.deleteMany({ where: { categoryId: id } })
    await db.recurringRule.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
    await db.category.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
