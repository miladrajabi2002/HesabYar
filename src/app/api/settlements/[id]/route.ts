import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { settleUpdateSchema } from "@/lib/validation"
import { dayKeyToDate } from "@/lib/jalali"
import { getPersonBalance, recomputeInvoice } from "@/lib/finance"
import { settlementInclude } from "@/lib/includes"
import { deleteSettlementFull } from "@/lib/settlements"

export const dynamic = "force-dynamic"

/** GET /api/settlements/[id] — جزئیات یک دریافت/پرداخت (با چک‌های بابتش) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const settlement = await db.settlement.findUnique({ where: { id }, include: settlementInclude })
    if (!settlement) return fail("تسویه پیدا نشد", 404)
    const checks = await db.checkPaper.findMany({
      where: { settlementId: id },
      select: { id: true, serial: true, amount: true, bankKey: true, dueDate: true, status: true },
    })
    return ok({ settlement, checks })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * PATCH /api/settlements/[id] — ویرایش مبلغ/تاریخ/توضیح (و حساب برای نقدی)
 * جهت و روش ثابت می‌ماند. گردش بانکی نقدی هم‌زمان اصلاح می‌شود.
 * مبلغ تسویهٔ چکی فقط وقتی چک «در جریان» است قابل تغییر است (چک هم هم‌مبلغ می‌شود).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const { data, error } = await parseBody(req, settleUpdateSchema)
    if (error) return error

    const s = await db.settlement.findUnique({ where: { id }, include: { person: true } })
    if (!s) return fail("تسویه پیدا نشد", 404)

    if (s.invoiceId && data.amount !== s.amount) {
      const inv = await db.invoice.findUnique({ where: { id: s.invoiceId } })
      if (inv && data.amount > inv.credit + s.amount) {
        return fail("مبلغ بیشتر از مانده فاکتور است", 400)
      }
    }

    const date = dayKeyToDate(data.date)

    if (s.method === "CASH") {
      const accountId = data.accountId ?? s.accountId
      if (!accountId) return fail("حساب بانکی را انتخاب کنید", 400)
      const account = await db.account.findUnique({ where: { id: accountId } })
      if (!account) return fail("حساب بانکی پیدا نشد", 404)

      await db.$transaction(async (tx) => {
        await tx.settlement.update({
          where: { id },
          data: { amount: data.amount, date, accountId, note: data.note },
        })
        const txData = { accountId, amount: data.amount, date }
        const upd = await tx.transaction.updateMany({
          where: { type: "SETTLEMENT_CASH", refId: id },
          data: txData,
        })
        if (upd.count === 0) {
          await tx.transaction.create({
            data: {
              ...txData,
              direction: s.direction === "RECEIVE" ? "IN" : "OUT",
              type: "SETTLEMENT_CASH",
              refId: id,
              description:
                s.direction === "RECEIVE"
                  ? `دریافت نقدی از «${s.person.name}»`
                  : `پرداخت نقدی به «${s.person.name}»`,
            },
          })
        }
      })
    } else {
      const checks = await db.checkPaper.findMany({ where: { settlementId: id } })
      if (data.amount !== s.amount) {
        if (checks.some((c) => c.status !== "PENDING")) {
          return fail("چکِ این تسویه پاس/برگشت/لغو شده؛ مبلغ قابل تغییر نیست", 400)
        }
        if (checks.length > 1) return fail("این تسویه بیش از یک چک دارد؛ مبلغ قابل تغییر نیست", 400)
      }
      await db.$transaction(async (tx) => {
        await tx.settlement.update({ where: { id }, data: { amount: data.amount, date, note: data.note } })
        if (data.amount !== s.amount && checks.length === 1) {
          await tx.checkPaper.update({ where: { id: checks[0].id }, data: { amount: data.amount } })
        }
      })
    }

    if (s.invoiceId) await recomputeInvoice(s.invoiceId)
    const balance = await getPersonBalance(s.personId)
    const full = await db.settlement.findUnique({ where: { id }, include: settlementInclude })
    return ok({ settlement: full, balance })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/settlements/[id] — حذف دریافت/پرداخت با گردش بانکی و چک‌های بابتش */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const res = await deleteSettlementFull(id)
    if (!res) return fail("تسویه پیدا نشد", 404)
    return ok({ ok: true, balance: res.balance })
  } catch (e) {
    return serverError(e)
  }
}
