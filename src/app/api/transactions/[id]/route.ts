import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { deleteSettlementFull } from "@/lib/settlements"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/transactions/[id] — حذف یک گردش بانکی از لیست گردش حساب‌ها
 *  • تسویه نقدی  → خود تسویه (و اثرش روی تراز شخص/مانده فاکتور) هم برمی‌گردد
 *  • انتقال       → هر دو سمت انتقال پاک می‌شود
 *  • فاکتور/چک/مانده اولیه → باید از جای خودشان اصلاح شوند (مگر منبعشان دیگر وجود نداشته باشد)
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const t = await db.transaction.findUnique({ where: { id } })
    if (!t) return fail("گردش پیدا نشد", 404)

    switch (t.type) {
      case "SETTLEMENT_CASH": {
        if (t.refId && (await deleteSettlementFull(t.refId))) return ok({ ok: true })
        await db.transaction.delete({ where: { id } }) // گردش یتیم (تسویه‌اش قبلاً پاک شده)
        return ok({ ok: true })
      }
      case "TRANSFER": {
        // سمت مقابل: حساب/مقصد جابه‌جا، همان مبلغ و تاریخ، جهت مخالف
        const mirror = await db.transaction.findMany({
          where: {
            type: "TRANSFER",
            id: { not: id },
            accountId: t.toAccountId ?? undefined,
            toAccountId: t.accountId,
            amount: t.amount,
            date: t.date,
            direction: t.direction === "IN" ? "OUT" : "IN",
          },
          orderBy: { createdAt: "asc" },
        })
        // نزدیک‌ترین به لحظهٔ ساخت
        mirror.sort(
          (a, b) =>
            Math.abs(+a.createdAt - +t.createdAt) - Math.abs(+b.createdAt - +t.createdAt)
        )
        const ids = [id, ...(mirror[0] ? [mirror[0].id] : [])]
        await db.transaction.deleteMany({ where: { id: { in: ids } } })
        return ok({ ok: true, removed: ids.length })
      }
      case "INVOICE_CASH": {
        if (t.refId && (await db.invoice.findUnique({ where: { id: t.refId }, select: { id: true } }))) {
          return fail("این گردش بابت یک فاکتور است؛ از صفحهٔ همان فاکتور اصلاحش کنید", 400)
        }
        await db.transaction.delete({ where: { id } })
        return ok({ ok: true })
      }
      case "CHECK_CASHED": {
        if (t.refId && (await db.checkPaper.findUnique({ where: { id: t.refId }, select: { id: true } }))) {
          return fail("این گردش بابت پاس‌شدن یک چک است؛ وضعیت چک را از صفحهٔ چک‌ها برگردانید", 400)
        }
        await db.transaction.delete({ where: { id } })
        return ok({ ok: true })
      }
      default:
        return fail("مانده اولیه را از «ویرایش حساب» تغییر دهید", 400)
    }
  } catch (e) {
    return serverError(e)
  }
}
