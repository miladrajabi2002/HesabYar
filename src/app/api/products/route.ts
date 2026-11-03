import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { productCreateSchema } from "@/lib/validation"
import { getProductStocks } from "@/lib/finance"
import { z } from "zod"

export const dynamic = "force-dynamic"

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
})

/** GET /api/products — لیست کالاها + موجودی زنده + آخرین قیمت خرید/فروش */
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

    // آخرین قیمت خرید و فروش هر کالا
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

    // میانگین قیمت تمام‌شده هر کالا = (موجودی اولیه × قیمت خریدش + جمع خریدها) ÷ (اولیه + تعداد خرید)
    const purAgg = await db.invoiceItem.groupBy({
      by: ["productId"],
      where: { invoice: { type: "PURCHASE" } },
      _sum: { quantity: true, total: true },
    })
    const purMap = new Map(
      purAgg.map((r) => [r.productId, { qty: r._sum.quantity ?? 0, total: r._sum.total ?? 0 }])
    )

    // عکس کالا (ADV-05): اولین تصویر پیوست‌شدهٔ هر کالا — اختیاری، برای بندانگشتی لیست
    const productIds = products.map((p) => p.id)
    const photoAtts = productIds.length
      ? await db.attachment.findMany({
          where: { refType: "PRODUCT", refId: { in: productIds }, mime: { startsWith: "image/" } },
          orderBy: { createdAt: "desc" },
          select: { refId: true, id: true },
        })
      : []
    const photoMap = new Map<string, string>()
    for (const a of photoAtts) {
      if (!photoMap.has(a.refId)) photoMap.set(a.refId, a.id)
    }

    const result = products.map((p) => {
      const pur = purMap.get(p.id)
      const initialQty = p.initialStock ?? 0
      const totalQty = initialQty + (pur?.qty ?? 0)
      const avgCostPrice =
        totalQty > 0
          ? Math.round((initialQty * (p.initialStockCostPrice ?? 0) + (pur?.total ?? 0)) / totalQty)
          : 0
      return {
        ...p,
        stock: stocks.get(p.id) ?? 0,
        photoId: photoMap.get(p.id) ?? null,
        avgCostPrice,
        lastPurchasePrice: lastPrices.get(p.id)?.purchase ?? 0,
        lastSalePrice: lastPrices.get(p.id)?.sale ?? 0,
      }
    })

    return ok({ products: result })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/products — افزودن کالا */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, productCreateSchema)
    if (error) return error
    const dup = await db.product.findFirst({
      where: { name: data.name, brand: data.brand ?? undefined, code: data.code ?? undefined },
    })
    if (dup) return fail("کالا مشابهی با همین نام/برند/کد وجود دارد", 400)
    const product = await db.product.create({ data })
    return ok({ product })
  } catch (e) {
    return serverError(e)
  }
}
