import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { debtSettleSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * POST /api/debts/[id]/settle — تسویه کامل یا جزئی
 * یک تراکنش واقعی در حساب انتخابی ثبت می‌شود:
 *  - I_OWE (بدهی من): پرداخت → هزینه
 *  - OWED_TO_ME (طلب من): دریافت → درآمد
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, debtSettleSchema)
    if (error) return error

    const debt = await db.debt.findUnique({ where: { id } })
    if (!debt) return fail("رکورد یافت نشد", 404)
    if (debt.isSettled) return fail("این بدهی/طلب قبلاً تسویه شده است", 400)

    const remaining = debt.amount - debt.settledAmount
    if (data.amount > remaining) {
      return fail(`مبلغ تسویه نمی‌تواند بیش از مانده (${remaining.toLocaleString("fa-IR")} تومان) باشد`, 400)
    }

    const account = await db.account.findUnique({ where: { id: data.accountId } })
    if (!account) return fail("حساب انتخاب‌شده یافت نشد", 400)

    const isMyDebt = debt.direction === "I_OWE"
    const txNote = isMyDebt
      ? `تسویه بدهی به ${debt.person}${data.note ? ` — ${data.note}` : ""}`
      : `دریافت طلب از ${debt.person}${data.note ? ` — ${data.note}` : ""}`

    const transaction = await db.transaction.create({
      data: {
        type: isMyDebt ? "EXPENSE" : "INCOME",
        amount: data.amount,
        accountId: data.accountId,
        date: data.date ? new Date(data.date) : new Date(),
        note: txNote,
        debtId: debt.id,
      },
    })

    const newSettled = debt.settledAmount + data.amount
    const updated = await db.debt.update({
      where: { id },
      data: {
        settledAmount: newSettled,
        isSettled: newSettled >= debt.amount,
      },
    })

    return ok({ debt: updated, transaction })
  } catch (e) {
    return serverError(e)
  }
}
