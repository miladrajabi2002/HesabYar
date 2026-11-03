import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/products/[id]/last-price?personId=…&exclude=… — آخرین قیمتی که همین کالا با همین شخص
 * خرید/فروش شده (برای پیشنهاد قیمت هنگام افزودن قلم به فاکتور)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const sp = new URL(req.url).searchParams
    const personId = sp.get("personId")
    // در ویرایش فاکتور، خود همان فاکتور کنار گذاشته می‌شود
    const exclude = sp.get("exclude")
    if (!personId) return ok({ sale: 0, purchase: 0 })
    const items = await db.invoiceItem.findMany({
      where: { productId: id, invoice: { personId, ...(exclude ? { id: { not: exclude } } : {}) } },
      orderBy: { invoice: { date: "desc" } },
      select: { unitPrice: true, invoice: { select: { type: true } } },
      take: 40,
    })
    let sale = 0
    let purchase = 0
    for (const it of items) {
      if (it.invoice.type === "SALE" && !sale) sale = it.unitPrice
      if (it.invoice.type === "PURCHASE" && !purchase) purchase = it.unitPrice
    }
    return ok({ sale, purchase })
  } catch (e) {
    return serverError(e)
  }
}
