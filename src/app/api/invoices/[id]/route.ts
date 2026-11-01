import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { invoiceCreateSchema } from "@/lib/validation"
import { dayKeyToDate } from "@/lib/jalali"
import { getAveragePurchasePrice } from "@/lib/finance"
import { invoiceInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/** GET /api/invoices/[id] — جزئیات کامل فاکتور */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const invoice = await db.invoice.findUnique({ where: { id }, include: invoiceInclude })
    if (!invoice) return fail("فاکتور پیدا نشد", 404)
    return ok({ invoice })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * PUT /api/invoices/[id] — ویرایش کامل فاکتور (شخص، تاریخ، اقلام، تخفیف، نقدی، چک‌ها، یادداشت)
 * اقلام جایگزین می‌شوند → موجودی و میانگین خرید به‌صورت خودکار به‌روز می‌شود.
 * چک‌های نقدشده/برگشتی اجازه ویرایش نمی‌دهند؛ تسویه‌های ثبت‌شدهٔ بعدی حفظ می‌شوند.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const existing = await db.invoice.findUnique({ where: { id } })
    if (!existing) return fail("فاکتور پیدا نشد", 404)

    const { data, error } = await parseBody(req, invoiceCreateSchema)
    if (error) return error
    if (data.type !== existing.type) {
      return fail("تغییر نوع فاکتور مجاز نیست — این فاکتور را حذف و فاکتور جدید ثبت کنید", 400)
    }

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

    // چک نقدشده/برگشتی قابل جابه‌جایی نیست (گردش بانکی‌اش ثبت شده)
    const oldChecks = await db.checkPaper.findMany({
      where: { invoiceId: id },
      select: { id: true, status: true },
    })
    if (oldChecks.some((c) => c.status !== "PENDING")) {
      return fail("این فاکتور چک نقدشده/برگشتی دارد و قابل ویرایش نیست", 400)
    }

    // تسویه‌های ثبت‌شدهٔ بعدی بابت فاکتور حفظ می‌شوند و در مانده لحاظ می‌گردند
    const settledAgg = await db.settlement.aggregate({
      where: { invoiceId: id },
      _sum: { amount: true },
    })
    const settledElsewhere = settledAgg._sum.amount ?? 0

    const checkTotal = data.checks.reduce((s, c) => s + c.amount, 0)
    const subtotal = data.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
    const total = Math.max(0, subtotal - data.discount)
    const credit = Math.max(0, total - data.paidCash - checkTotal - settledElsewhere)
    const excess = Math.max(0, data.paidCash + checkTotal - total)
    const date = dayKeyToDate(data.date)

    await db.$transaction(async (tx) => {
      // ۱) پاکسازی وابستگی‌های قدیمی
      await tx.transaction.deleteMany({ where: { type: "INVOICE_CASH", refId: id } })
      const oldCheckIds = oldChecks.map((c) => c.id)
      if (oldCheckIds.length > 0) {
        await tx.checkPaper.deleteMany({ where: { id: { in: oldCheckIds }, status: "PENDING" } })
      }
      const removedExcess = await tx.settlement.findMany({
        where: { invoiceId: null, note: { endsWith: `(ref:${id})` } },
        select: { id: true },
      })
      if (removedExcess.length > 0) {
        await tx.transaction.deleteMany({
          where: { type: "SETTLEMENT_CASH", refId: { in: removedExcess.map((s) => s.id) } },
        })
        await tx.settlement.deleteMany({ where: { id: { in: removedExcess.map((s) => s.id) } } })
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } })

      // ۲) به‌روزرسانی خود فاکتور
      await tx.invoice.update({
        where: { id },
        data: {
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

      // ۳) اقلام جدید (برای فروش، قیمت تمام‌شده دوباره اسنپ‌شات می‌شود)
      for (const item of data.items) {
        const product = products.find((p) => p.id === item.productId)!
        const costPrice =
          data.type === "SALE" ? await getAveragePurchasePrice(item.productId, date) : 0
        await tx.invoiceItem.create({
          data: {
            invoiceId: id,
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

      // ۴) گردش نقدی جدید
      if (data.paidCash > 0 && account) {
        await tx.transaction.create({
          data: {
            accountId: account.id,
            direction: data.type === "SALE" ? "IN" : "OUT",
            amount: data.paidCash,
            type: "INVOICE_CASH",
            refId: id,
            description: `${data.type === "SALE" ? "فروش" : "خرید"} نقدی — فاکتور ${existing.number}`,
            date,
          },
        })
      }

      // ۵) چک‌های جدید
      for (const c of data.checks) {
        await tx.checkPaper.create({
          data: {
            serial: c.serial ?? "",
            amount: c.amount,
            bankKey: c.bankKey,
            direction: data.type === "SALE" ? "RECEIVED" : "ISSUED",
            dueDate: dayKeyToDate(c.dueDate),
            personId: data.personId,
            invoiceId: id,
            note: c.note ?? `بابت فاکتور ${existing.number}`,
            // ثبت چک: دریافتی به نام ما، صادره به نام مشتری
            isRegistered: c.isRegistered,
            registeredName: c.isRegistered ? c.registeredName ?? null : null,
            registeredNationalId: c.isRegistered ? c.registeredNationalId ?? null : null,
            registeredAt: c.isRegistered ? date : null,
          },
        })
      }

      // ۶) مازاد پرداخت → علی‌الحساب شخص
      if (excess > 0) {
        await tx.settlement.create({
          data: {
            personId: data.personId,
            invoiceId: null,
            direction: data.type === "SALE" ? "RECEIVE" : "PAY",
            method: checkTotal > 0 ? "CHECK" : "CASH",
            amount: excess,
            accountId: null,
            date,
            note: `مازاد پرداخت فاکتور ${existing.number} (ref:${id})`,
          },
        })
      }
    })

    const full = await db.invoice.findUnique({ where: { id }, include: invoiceInclude })
    return ok({ invoice: full, excess })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/invoices/[id] — حذف فاکتور با همه وابستگی‌ها (اقلام، چک‌ها، تسویه‌ها، گردش‌ها) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) return fail("فاکتور پیدا نشد", 404)

    await db.$transaction(async (tx) => {
      // ۱) چک‌های بابت خود فاکتور
      const directChecks = await tx.checkPaper.findMany({ where: { invoiceId: id }, select: { id: true } })
      const directCheckIds = directChecks.map((c) => c.id)

      // ۲) تسویه‌های بابت فاکتور + چک‌های آن تسویه‌ها
      const settlements = await tx.settlement.findMany({ where: { invoiceId: id }, select: { id: true, method: true } })
      const settlementIds = settlements.map((s) => s.id)
      const settleChecks = await tx.checkPaper.findMany({ where: { settlementId: { in: settlementIds } }, select: { id: true } })
      const allCheckIds = [...directCheckIds, ...settleChecks.map((c) => c.id)]

      // ۳) حذف گردش‌های بانکی مرتبط
      await tx.transaction.deleteMany({ where: { type: "INVOICE_CASH", refId: id } })
      if (settlementIds.length > 0) {
        await tx.transaction.deleteMany({ where: { type: "SETTLEMENT_CASH", refId: { in: settlementIds } } })
      }
      if (allCheckIds.length > 0) {
        await tx.transaction.deleteMany({ where: { type: "CHECK_CASHED", refId: { in: allCheckIds } } })
      }

      // ۴) حذف چک‌ها، تسویه‌ها، اقلام و خود فاکتور
      if (allCheckIds.length > 0) {
        await tx.checkPaper.deleteMany({ where: { id: { in: allCheckIds } } })
      }
      if (settlementIds.length > 0) {
        await tx.settlement.deleteMany({ where: { id: { in: settlementIds } } })
      }
      // ۵) حذف تسویه «مازاد پرداخت» (علی‌الحساب) ثبت‌شده موقع ایجاد فاکتور
      await tx.settlement.deleteMany({
        where: { invoiceId: null, note: { endsWith: `(ref:${id})` } },
      })
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } })
      await tx.invoice.delete({ where: { id } })
    })

    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
