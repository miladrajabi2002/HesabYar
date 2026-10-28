import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { alertRuleCreateSchema } from "@/lib/validation"
import { db as prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const ALERT_LABELS: Record<string, string> = {
  BUDGET_THRESHOLD: "هشدار عبور بودجه از آستانه",
  LOW_BALANCE: "هشدار موجودی کم حساب",
  DEBT_DUE: "هشدار نزدیک شدن سررسید بدهی/طلب",
  RECURRING_RUN: "اعلان ثبت تراکنش تکرارشونده",
}

/** GET /api/alerts — قوانین هشدار */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const rules = await db.alertRule.findMany({ orderBy: { type: "asc" } })
    const accounts = await prisma.account.findMany({ select: { id: true, name: true } })
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
    return ok({
      rules: rules.map((r) => ({
        ...r,
        label: ALERT_LABELS[r.type] ?? r.type,
        accountName: r.accountId ? accountMap.get(r.accountId) ?? null : null,
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/alerts — ایجاد/به‌روزرسانی قانون هشدار (به‌ازای هر نوع یک قانون) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, alertRuleCreateSchema)
    if (error) return error

    if (data.accountId) {
      const account = await db.account.findUnique({ where: { id: data.accountId } })
      if (!account) return fail("حساب یافت نشد", 400)
    }

    const existing = await db.alertRule.findFirst({
      where: { type: data.type, accountId: data.accountId ?? null },
    })
    if (existing) {
      const rule = await db.alertRule.update({
        where: { id: existing.id },
        data: { isActive: data.isActive, threshold: data.threshold ?? null, lastFiredAt: null },
      })
      return ok({ rule })
    }

    const rule = await db.alertRule.create({
      data: {
        type: data.type,
        accountId: data.accountId ?? null,
        threshold: data.threshold ?? null,
        isActive: data.isActive,
      },
    })
    return ok({ rule }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
