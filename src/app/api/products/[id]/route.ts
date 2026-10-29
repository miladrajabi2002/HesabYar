import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { productUpdateSchema } from "@/lib/validation"
import { getProductStock } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/products/[id] — جزئیات جنس: آمار خرید/فروش + گردش اخیر */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const product = await db.product.findUnique({ where: { id } })
    if (!product || product.isArchived) return fail("جنس پیدا نشد", 404)

    const items = await db.invoiceItem.findMany({
      where: { productId: id },
      orderBy: { invoice: { date: "desc" } },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            type: true,
            date: true,
            person: { select: { id: true, name: true } },
          },
        },
      },
      take: 300,
    })

    let purchasedQty = 0
    let purchasedAmount = 0
    let soldQty = 0
    let soldAmount = 0
    let lastPurchasePrice = 0
    let lastSalePrice = 0
    for (const it of items) {
      if (it.invoice.type === "PURCHASE") {
        purchasedQty += it.quantity
        purchasedAmount += it.total
        if (!lastPurchasePrice) lastPurchasePrice = it.unitPrice
      } else {
        soldQty += it.quantity
        soldAmount += it.total
        if (!lastSalePrice) lastSalePrice = it.unitPrice
      }
    }

    const stock = await getProductStock(id)

    const movements = items.slice(0, 15).map((it) => ({
      id: it.id,
      invoiceId: it.invoice.id,
      invoiceNumber: it.invoice.number,
      type: it.invoice.type,
      date: it.invoice.date,
      personName: it.invoice.person.name,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.total,
    }))

    return ok({
      product: { ...product, stock },
      stats: {
        stock,
        purchasedQty,
        purchasedAmount,
        avgPurchasePrice: purchasedQty > 0 ? Math.round(purchasedAmount / purchasedQty) : 0,
        soldQty,
        soldAmount,
        avgSalePrice: soldQty > 0 ? Math.round(soldAmount / soldQty) : 0,
        lastPurchasePrice,
        lastSalePrice,
      },
      movements,
    })
  } catch (e) {
    return serverError(e)
  }
}

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
