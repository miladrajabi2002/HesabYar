import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { invoiceCreateSchema, invoiceFilterSchema } from "@/lib/validation"
import { dayKeyToDate } from "@/lib/jalali"
import { getAveragePurchasePrice, nextInvoiceNumber } from "@/lib/finance"
import { invoiceInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/**
 * GET /api/invoices — لیست فاکتورها با فیلتر نوع/شخص/ماه/جستجو + صفحه‌بندی
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data: f, error } = parseQuery(req, invoiceFilterSchema)
    if (error) return error

    const where = {
      ...(f.type ? { type: f.type } : {}),
      ...(f.personId ? { personId: f.personId } : {}),
    }
    const total = await db.invoice.count({ where })

    const invoices = await db.invoice.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: {
        person: { select: { id: true, name: true, company: true, phone: true } },
        account: { select: { id: true, name: true, bankKey: true } },
        items: { select: { id: true, productName: true, quantity: true, unit: true, total: true } },
        checks: { select: { id: true, amount: true, bankKey: true, dueDate: true, status: true } },
      },
    })
    return ok({ invoices, total, page: f.page, pageSize: f.pageSize })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * POST /api/invoices — ثبت فاکتور خرید/فروش با اقلام چندتایی + پرداخت (نقدی/چک/نسیه)
 * برای هر قلم فروش، قیمت تمام‌شده (میانگین خرید) اسنپ‌شات می‌شود.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, invoiceCreateSchema)
    if (error) return error

    const person = await db.person.findUnique({ where: { id: data.personId } })
    if (!person) return fail("شخص پیدا نشد", 404)

    const account = data.accountId
      ? await db.account.findFirst({ where: { id: data.accountId, isArchived: false } })
      : null
    if (data.accountId && !account) return fail("حساب بانکی پیدا نشد", 404)

    // اعتبارسنجی اجناس
    const productIds = [...new Set(data.items.map((i) => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    if (products.length !== productIds.length) return fail("یکی از اجناس پیدا نشد", 404)

    const checkTotal = data.checks.reduce((s, c) => s + c.amount, 0)
    const subtotal = data.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
    const total = Math.max(0, subtotal - data.discount)
    const credit = Math.max(0, total - data.paidCash - checkTotal)
    const date = dayKeyToDate(data.date)

    const invoice = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(),
          type: data.type,
          personId: data.personId,
          accountId: account?.id ?? null,
          date,
          subtotal,
          discount: data.discount,
          total,
          paidCash: data.paidCash,
          paidChecks: checkTotal,
          credit,
          status: credit <= 0 ? "SETTLED" : "OPEN",
          note: data.note ?? null,
        },
      })

      for (const item of data.items) {
        const product = products.find((p) => p.id === item.productId)!
        // اسنپ‌شات قیمت تمام‌شده برای محاسبه سود فروش
        const costPrice =
          data.type === "SALE" ? await getAveragePurchasePrice(item.productId, date) : 0
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: item.productId,
            productName: product.name,
            brand: product.brand,
            code: product.code,
            unit: product.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice,
            total: Math.round(item.quantity * item.unitPrice),
          },
        })
      }

      // گردش نقدی
      if (data.paidCash > 0 && account) {
        await tx.transaction.create({
          data: {
            accountId: account.id,
            direction: data.type === "SALE" ? "IN" : "OUT",
            amount: data.paidCash,
            type: "INVOICE_CASH",
            refId: invoice.id,
            description: `${data.type === "SALE" ? "فروش" : "خرید"} نقدی — فاکتور ${invoice.number}`,
            date,
          },
        })
      }

      // چک‌ها
      for (const c of data.checks) {
        await tx.checkPaper.create({
          data: {
            serial: c.serial ?? "",
            amount: c.amount,
            bankKey: c.bankKey,
            direction: data.type === "SALE" ? "RECEIVED" : "ISSUED",
            dueDate: dayKeyToDate(c.dueDate),
            personId: data.personId,
            invoiceId: invoice.id,
            note: c.note ?? `بابت فاکتور ${invoice.number}`,
          },
        })
      }

      return invoice
    })

    const full = await db.invoice.findUnique({ where: { id: invoice.id }, include: invoiceInclude })
    return ok({ invoice: full })
  } catch (e) {
    return serverError(e)
  }
}
