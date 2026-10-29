import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { productUpdateSchema } from "@/lib/validation"
import { getProductStock } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** PATCH /api/products/[id] — ویرایش جنس */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const { data, error } = await parseBody(req, productUpdateSchema)
    if (error) return error
    const exists = await db.product.findUnique({ where: { id } })
    if (!exists) return fail("جنس پیدا نشد", 404)
    const product = await db.product.update({ where: { id }, data })
    return ok({ product })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/products/[id] — فقط اگر در فاکتوری استفاده نشده باشد */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const used = await db.invoiceItem.count({ where: { productId: id } })
    if (used > 0) return fail("این جنس در فاکتورها استفاده شده و قابل حذف نیست؛ بایگانیش کنید", 400)
    const stock = await getProductStock(id)
    if (stock !== 0) return fail("موجودی این جنس صفر نیست", 400)
    await db.product.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
