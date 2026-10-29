import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
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
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } })
      await tx.invoice.delete({ where: { id } })
    })

    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
