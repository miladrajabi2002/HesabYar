import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { settleSchema } from "@/lib/validation"
import { dayKeyToDate, nowTehran } from "@/lib/jalali"
import { getPersonBalance, recomputeInvoice } from "@/lib/finance"
import { settlementInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/**
 * POST /api/settlements — تسویه طلب/بدهی یک شخص (نقدی یا چکی)
 * چکِ تسویه تا سررسید «در جریان» می‌ماند و با پاس شدن، گردش بانکی ثبت می‌شود.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, settleSchema)
    if (error) return error

    const person = await db.person.findUnique({ where: { id: data.personId } })
    if (!person) return fail("شخص پیدا نشد", 404)

    if (data.invoiceId) {
      const inv = await db.invoice.findUnique({ where: { id: data.invoiceId } })
      if (!inv || inv.personId !== data.personId) return fail("فاکتور با این شخص هم‌خوانی ندارد", 400)
      if (inv.credit <= 0) return fail("این فاکتور تسویه شده است", 400)
      if (data.amount > inv.credit) return fail("مبلغ تسویه بیشتر از مانده فاکتور است", 400)
    }

    const date = data.date ? dayKeyToDate(data.date) : nowTehran()

    const settlement = await db.$transaction(async (tx) => {
      const settlement = await tx.settlement.create({
        data: {
          personId: data.personId,
          invoiceId: data.invoiceId ?? null,
          direction: data.direction,
          method: data.method,
          amount: data.amount,
          accountId: data.method === "CASH" ? data.accountId ?? null : null,
          date,
          note: data.note ?? null,
        },
      })

      if (data.method === "CASH" && data.accountId) {
        await tx.transaction.create({
          data: {
            accountId: data.accountId,
            direction: data.direction === "RECEIVE" ? "IN" : "OUT",
            amount: data.amount,
            type: "SETTLEMENT_CASH",
            refId: settlement.id,
            description:
              data.direction === "RECEIVE"
                ? `دریافت نقدی از «${person.name}»`
                : `پرداخت نقدی به «${person.name}»`,
            date,
          },
        })
      }

      if (data.method === "CHECK" && data.check) {
        await tx.checkPaper.create({
          data: {
            serial: data.check.serial ?? "",
            amount: data.check.amount,
            bankKey: data.check.bankKey,
            direction: data.direction === "RECEIVE" ? "RECEIVED" : "ISSUED",
            dueDate: dayKeyToDate(data.check.dueDate),
            personId: data.personId,
            settlementId: settlement.id,
            note: data.check.note ?? "تسویه چکی",
          },
        })
      }

      return settlement
    })

    if (data.invoiceId) await recomputeInvoice(data.invoiceId)
    const balance = await getPersonBalance(data.personId)
    const full = await db.settlement.findUnique({ where: { id: settlement.id }, include: settlementInclude })
    return ok({ settlement: full, balance })
  } catch (e) {
    return serverError(e)
  }
}
