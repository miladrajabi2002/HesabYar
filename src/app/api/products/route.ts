import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { productCreateSchema } from "@/lib/validation"
import { getProductStocks } from "@/lib/finance"
import { z } from "zod"

export const dynamic = "force-dynamic"

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lowStock: z.coerce.boolean().optional(),
})

/** GET /api/products — لیست اجناس + موجودی زنده + آخرین قیمت خرید/فروش */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data: f, error } = parseQuery(req, listQuerySchema)
    if (error) return error

    const products = await db.product.findMany({
      where: {
        isArchived: false,
        ...(f.q
          ? {
              OR: [
                { name: { contains: f.q } },
                { brand: { contains: f.q } },
                { code: { contains: f.q } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    })

    const stocks = await getProductStocks()

    // آخرین قیمت خرید و فروش هر جنس
    const lastPrices = new Map<string, { purchase: number; sale: number }>()
    const items = await db.invoiceItem.findMany({
      orderBy: { invoice: { date: "desc" } },
      select: {
        productId: true,
        unitPrice: true,
        invoice: { select: { type: true } },
      },
      take: 2000,
    })
    for (const it of items) {
      const cur = lastPrices.get(it.productId) || { purchase: 0, sale: 0 }
      if (it.invoice.type === "PURCHASE" && cur.purchase === 0) cur.purchase = it.unitPrice
      if (it.invoice.type === "SALE" && cur.sale === 0) cur.sale = it.unitPrice
      lastPrices.set(it.productId, cur)
    }

    let result = products.map((p) => ({
      ...p,
      stock: stocks.get(p.id) ?? 0,
      lastPurchasePrice: lastPrices.get(p.id)?.purchase ?? 0,
      lastSalePrice: lastPrices.get(p.id)?.sale ?? 0,
      lowStock: (stocks.get(p.id) ?? 0) <= p.minStock,
    }))
    if (f.lowStock) result = result.filter((p) => p.lowStock)

    return ok({ products: result })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/products — افزودن جنس */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, productCreateSchema)
    if (error) return error
    const dup = await db.product.findFirst({
      where: { name: data.name, brand: data.brand ?? undefined, code: data.code ?? undefined },
    })
    if (dup) return fail("جنس مشابهی با همین نام/برند/کد وجود دارد", 400)
    const product = await db.product.create({ data })
    return ok({ product })
  } catch (e) {
    return serverError(e)
  }
}
