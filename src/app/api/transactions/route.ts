import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { transactionCreateSchema, transactionQuerySchema } from "@/lib/validation"
import { txInclude } from "@/lib/includes"
import { monthKeyRange } from "@/lib/jalali"
import { getRangeTotals } from "@/lib/finance"
import { checkBudgetAlerts } from "@/lib/telegram/alerts"

export const dynamic = "force-dynamic"

/** GET /api/transactions — فیلتر، جست‌وجو و صفحه‌بندی */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = parseQuery(req, transactionQuerySchema)
    if (error) return error

    const where: Prisma.TransactionWhereInput = { AND: [] }
    const w = where.AND as Prisma.TransactionWhereInput[]

    if (data.monthJalali) {
      const { start, end } = monthKeyRange(data.monthJalali)
      w.push({ date: { gte: start, lte: end } })
    } else {
      if (data.from) w.push({ date: { gte: new Date(data.from) } })
      if (data.to) w.push({ date: { lte: new Date(data.to) } })
    }
    if (data.type) w.push({ type: data.type })
    if (data.accountId) w.push({ OR: [{ accountId: data.accountId }, { toAccountId: data.accountId }] })
    if (data.categoryId) w.push({ categoryId: data.categoryId })
    if (data.q) w.push({ note: { contains: data.q } })

    const [total, totals, transactions] = await Promise.all([
      db.transaction.count({ where }),
      getRangeTotals(
        data.monthJalali ? monthKeyRange(data.monthJalali).start : data.from ? new Date(data.from) : new Date(0),
        data.monthJalali ? monthKeyRange(data.monthJalali).end : data.to ? new Date(data.to) : new Date(9999, 0, 1),
        data.accountId ? { accountId: data.accountId } : {}
      ),
      db.transaction.findMany({
        where,
        include: txInclude,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
    ])

    return ok({
      transactions,
      total,
      page: data.page,
      pageSize: data.pageSize,
      totals,
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/transactions — ثبت تراکنش (هزینه/درآمد/انتقال) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, transactionCreateSchema)
    if (error) return error

    const account = await db.account.findUnique({ where: { id: data.accountId } })
    if (!account) return fail("حساب انتخاب‌شده یافت نشد", 400)

    if (data.type === "TRANSFER") {
      const toAccount = await db.account.findUnique({ where: { id: data.toAccountId as string } })
      if (!toAccount) return fail("حساب مقصد یافت نشد", 400)
    } else if (data.categoryId) {
      const category = await db.category.findUnique({ where: { id: data.categoryId } })
      if (!category) return fail("دسته انتخاب‌شده یافت نشد", 400)
    }

    const transaction = await db.transaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        accountId: data.accountId,
        toAccountId: data.type === "TRANSFER" ? data.toAccountId : null,
        categoryId: data.type === "TRANSFER" ? null : data.categoryId ?? null,
        date: new Date(data.date),
        note: data.note ?? null,
      },
      include: txInclude,
    })

    // بررسی فوری هشدار بودجه پس از ثبت هزینه
    if (data.type === "EXPENSE") {
      checkBudgetAlerts().catch(() => null)
    }

    return ok({ transaction }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
