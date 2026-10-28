/**
 * محاسبات مالی — lib/finance.ts
 * موجودی حساب‌ها فقط از طریق getAccountBalances محاسبه می‌شود و هیچ‌جا ذخیره نمی‌شود.
 * فرمول: موجودی = موجودی اولیه + Σدرآمد − Σهزینه + Σانتقال وارده − Σانتقال صادره
 * تراکنش TRANSFER هرگز در درآمد/هزینه/سود حساب نمی‌شود.
 */
import { db } from "./db"

export type TxType = "INCOME" | "EXPENSE" | "TRANSFER"

/** موجودی زنده همه حساب‌ها */
export async function getAccountBalances(): Promise<Map<string, number>> {
  const [accounts, byAccount, transfersIn] = await Promise.all([
    db.account.findMany({ select: { id: true, initialBalance: true } }),
    db.transaction.groupBy({
      by: ["accountId", "type"],
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["toAccountId"],
      where: { type: "TRANSFER" },
      _sum: { amount: true },
    }),
  ])

  const balances = new Map<string, number>()
  for (const a of accounts) balances.set(a.id, a.initialBalance)

  for (const row of byAccount) {
    const cur = balances.get(row.accountId) ?? 0
    const sum = row._sum.amount ?? 0
    if (row.type === "INCOME") balances.set(row.accountId, cur + sum)
    else if (row.type === "EXPENSE") balances.set(row.accountId, cur - sum)
    else if (row.type === "TRANSFER") balances.set(row.accountId, cur - sum)
  }

  for (const row of transfersIn) {
    if (!row.toAccountId) continue
    const cur = balances.get(row.toAccountId) ?? 0
    balances.set(row.toAccountId, cur + (row._sum.amount ?? 0))
  }

  return balances
}

/** موجودی کل همه حساب‌های فعال */
export async function getTotalBalance(): Promise<number> {
  const [balances, accounts] = await Promise.all([
    getAccountBalances(),
    db.account.findMany({ where: { isArchived: false }, select: { id: true } }),
  ])
  let total = 0
  for (const a of accounts) total += balances.get(a.id) ?? 0
  return total
}

export interface RangeTotals {
  income: number
  expense: number
  profit: number
  count: number
}

/** جمع درآمد/هزینه/سود یک بازه (بدون انتقال‌ها) */
export async function getRangeTotals(start: Date, end: Date, extra: { accountId?: string; categoryId?: string } = {}): Promise<RangeTotals> {
  const where = {
    date: { gte: start, lte: end },
    ...(extra.accountId ? { accountId: extra.accountId } : {}),
    ...(extra.categoryId ? { categoryId: extra.categoryId } : {}),
  }
  const rows = await db.transaction.groupBy({
    by: ["type"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  })
  let income = 0
  let expense = 0
  let count = 0
  for (const r of rows) {
    const sum = r._sum.amount ?? 0
    count += r._count._all
    if (r.type === "INCOME") income += sum
    else if (r.type === "EXPENSE") expense += sum
  }
  return { income, expense, profit: income - expense, count }
}

/** مصرف هر دسته در بازه (فقط هزینه‌ها) — خروجی: Map<categoryId, مبلغ> */
export async function getExpenseByCategory(start: Date, end: Date): Promise<Map<string, number>> {
  const rows = await db.transaction.groupBy({
    by: ["categoryId"],
    where: { type: "EXPENSE", date: { gte: start, lte: end }, categoryId: { not: null } },
    _sum: { amount: true },
  })
  const map = new Map<string, number>()
  for (const r of rows) if (r.categoryId) map.set(r.categoryId, r._sum.amount ?? 0)
  return map
}
