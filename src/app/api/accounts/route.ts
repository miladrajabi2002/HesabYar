import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { accountCreateSchema } from "@/lib/validation"
import { getAccountBalances } from "@/lib/finance"
import { startOfJalaliMonth, endOfJalaliDay } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** GET /api/accounts — لیست حساب‌ها با موجودی زنده و گردش ماه جاری */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const monthStart = startOfJalaliMonth(new Date())
    const monthEnd = endOfJalaliDay(new Date())

    const [accounts, balances, monthByAccount, monthTransfersIn] = await Promise.all([
      db.account.findMany({
        orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      getAccountBalances(),
      db.transaction.groupBy({
        by: ["accountId", "type"],
        where: { date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      db.transaction.groupBy({
        by: ["toAccountId"],
        where: { type: "TRANSFER", date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
    ])

    const monthIn = new Map<string, number>()
    const monthOut = new Map<string, number>()
    for (const r of monthByAccount) {
      const sum = r._sum.amount ?? 0
      const map = r.type === "INCOME" ? monthIn : monthOut
      if (r.type === "INCOME" || r.type === "EXPENSE") {
        map.set(r.accountId, (map.get(r.accountId) ?? 0) + sum)
      } else if (r.type === "TRANSFER") {
        monthOut.set(r.accountId, (monthOut.get(r.accountId) ?? 0) + sum)
      }
    }
    for (const r of monthTransfersIn) {
      if (!r.toAccountId) continue
      monthIn.set(r.toAccountId, (monthIn.get(r.toAccountId) ?? 0) + (r._sum.amount ?? 0))
    }

    const counts = await db.transaction.groupBy({ by: ["accountId"], _count: { _all: true } })
    const countMap = new Map(counts.map((c) => [c.accountId, c._count._all]))

    return ok({
      accounts: accounts.map((a) => ({
        ...a,
        balance: balances.get(a.id) ?? a.initialBalance,
        monthIn: monthIn.get(a.id) ?? 0,
        monthOut: monthOut.get(a.id) ?? 0,
        transactionCount: countMap.get(a.id) ?? 0,
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/accounts — ایجاد حساب جدید */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, accountCreateSchema)
    if (error) return error
    const account = await db.account.create({ data })
    return ok({ account }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
