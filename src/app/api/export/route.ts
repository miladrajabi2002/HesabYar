import { NextRequest } from "next/server"
import { fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { buildCsv, csvResponse } from "@/lib/csv"
import { getPersonBalances } from "@/lib/finance"
import { jalaliDayKey } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TYPES = ["invoices", "people", "products"] as const
type ExportType = (typeof TYPES)[number]

/**
 * GET /api/export?type=invoices — خروجی CSV/Excel (ADV-02)
 * با BOM برای نمایش صحیح فارسی در اکسل.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const type = new URL(req.url).searchParams.get("type") as ExportType | null
    if (!type || !TYPES.includes(type)) return fail("نوع خروجی نامعتبر است", 400)

    if (type === "invoices") {
      const invoices = await db.invoice.findMany({
        orderBy: [{ date: "desc" }, { number: "desc" }],
        include: {
          person: { select: { name: true, phone: true } },
          items: { select: { productName: true, brand: true, quantity: true, unit: true, unitPrice: true, total: true } },
        },
      })
      const csv = buildCsv(
        ["شماره فاکتور", "نوع", "تاریخ", "شخص", "موبایل", "اقلام", "جمع اقلام", "تخفیف", "مبلغ نهایی", "نقدی", "چک", "مانده", "وضعیت"],
        invoices.map((inv) => [
          inv.number,
          inv.type === "SALE" ? "فروش" : "خرید",
          jalaliDayKey(inv.date),
          inv.person.name,
          inv.person.phone ?? "",
          inv.items
            .map((it) => `${it.productName}${it.brand ? ` (${it.brand})` : ""} × ${it.quantity} ${formatUnit(it.unit)}`)
            .join(" + "),
          inv.subtotal,
          inv.discount,
          inv.total,
          inv.paidCash,
          inv.paidChecks,
          inv.credit,
          inv.credit > 0 ? "تسویه‌نشده" : "تسویه",
        ])
      )
      return csvResponse(csv, "hesabyar-invoices")
    }

    if (type === "people") {
      const [people, balances] = await Promise.all([
        db.person.findMany({ where: { isArchived: false }, orderBy: { name: "asc" } }),
        getPersonBalances(),
      ])
      const csv = buildCsv(
        ["نام", "نقش", "موبایل", "شرکت", "آدرس مغازه", "مانده حساب", "یادداشت"],
        people.map((p) => [
          p.name,
          p.role === "CUSTOMER" ? "مشتری" : p.role === "SUPPLIER" ? "تأمین‌کننده" : "مشتری/تأمین‌کننده",
          p.phone ?? "",
          p.company ?? "",
          p.shopAddress ?? "",
          balances.get(p.id) ?? 0,
          p.note ?? "",
        ])
      )
      return csvResponse(csv, "hesabyar-people")
    }

    // products — موجودی با یک کوئری گروهی
    const [products, purchaseAgg, saleAgg] = await Promise.all([
      db.product.findMany({ where: { isArchived: false }, orderBy: { name: "asc" } }),
      db.invoiceItem.groupBy({
        by: ["productId"],
        where: { invoice: { type: "PURCHASE" } },
        _sum: { quantity: true },
      }),
      db.invoiceItem.groupBy({
        by: ["productId"],
        where: { invoice: { type: "SALE" } },
        _sum: { quantity: true },
      }),
    ])
    const buyMap = new Map(purchaseAgg.map((g) => [g.productId, g._sum.quantity ?? 0]))
    const saleMap = new Map(saleAgg.map((g) => [g.productId, g._sum.quantity ?? 0]))
    const csv = buildCsv(
      ["نام جنس", "برند", "کد", "واحد", "موجودی اولیه", "مجموع خرید", "مجموع فروش", "موجودی فعلی", "حد هشدار"],
      products.map((p) => [
        p.name,
        p.brand ?? "",
        p.code ?? "",
        formatUnit(p.unit),
        p.initialStock,
        buyMap.get(p.id) ?? 0,
        saleMap.get(p.id) ?? 0,
        p.initialStock + (buyMap.get(p.id) ?? 0) - (saleMap.get(p.id) ?? 0),
        p.minStock,
      ])
    )
    return csvResponse(csv, "hesabyar-products")
  } catch (e) {
    return serverError(e, "ساخت خروجی ناموفق بود")
  }
}
