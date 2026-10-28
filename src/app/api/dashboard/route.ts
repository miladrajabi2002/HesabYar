import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import { getAccountBalances, getRangeTotals, getExpenseByCategory } from "@/lib/finance"
import { txInclude } from "@/lib/includes"
import { addJalaliMonths, currentMonthKey, jalaliMonthKey, monthKeyLabel, monthKeyRange, previousMonthKey } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** GET /api/dashboard — تمام داده‌های داشبورد در یک پاسخ */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const now = new Date()
    const monthKey = currentMonthKey()
    const { start: monthStart, end: monthEnd } = monthKeyRange(monthKey)
    const prevKey = previousMonthKey(monthKey)
    const { start: prevStart, end: prevEnd } = monthKeyRange(prevKey)

    const [balances, activeAccounts, month, prevMonth, lastTx, debts] = await Promise.all([
      getAccountBalances(),
      db.account.findMany({ where: { isArchived: false }, select: { id: true } }),
      getRangeTotals(monthStart, monthEnd),
      getRangeTotals(prevStart, prevEnd),
      db.transaction.findMany({ include: txInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 5 }),
      db.debt.findMany({ where: { isSettled: false } }),
    ])

    let totalBalance = 0
    for (const a of activeAccounts) totalBalance += balances.get(a.id) ?? 0

    // سری ۶ ماه اخیر شمسی
    const monthKeys: string[] = []
    for (let i = 5; i >= 0; i--) {
      monthKeys.push(jalaliMonthKey(i === 0 ? now : addJalaliMonths(now, -i)))
    }
    const series = await Promise.all(
      monthKeys.map(async (key) => {
        const { start, end } = monthKeyRange(key)
        const t = await getRangeTotals(start, end)
        return { key, label: monthKeyLabel(key), income: t.income, expense: t.expense }
      })
    )

    // تفکیک هزینه ماه جاری بر اساس دسته
    const [spentMap, categories] = await Promise.all([
      getExpenseByCategory(monthStart, monthEnd),
      db.category.findMany({ where: { type: "EXPENSE" } }),
    ])
    const catMap = new Map(categories.map((c) => [c.id, c]))
    const totalExpense = month.expense
    const expenseByCategory = [...spentMap.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: catMap.get(categoryId)?.name ?? "بدون دسته",
        color: catMap.get(categoryId)?.color ?? "#9CA3AF",
        icon: catMap.get(categoryId)?.icon ?? "CircleDollarSign",
        amount,
        percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

    // بودجه‌های ماه
    const budgets = await db.budget.findMany({
      where: { monthJalali: monthKey },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    })
    const budgetsAtRisk = budgets
      .map((b) => {
        const spent = spentMap.get(b.categoryId) ?? 0
        const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0
        return {
          id: b.id,
          categoryId: b.categoryId,
          categoryName: b.category.name,
          categoryColor: b.category.color,
          categoryIcon: b.category.icon,
          amount: b.amount,
          spent,
          percent: Math.round(percent * 10) / 10,
          alertThreshold: b.alertThreshold,
        }
      })
      .sort((a, b) => b.percent - a.percent)

    let iOweRemaining = 0
    let owedToMeRemaining = 0
    for (const d of debts) {
      const rem = d.amount - d.settledAmount
      if (d.direction === "I_OWE") iOweRemaining += rem
      else owedToMeRemaining += rem
    }

    return ok({
      totalBalance,
      accountsCount: activeAccounts.length,
      month: {
        key: monthKey,
        label: monthKeyLabel(monthKey),
        income: month.income,
        expense: month.expense,
        profit: month.profit,
        count: month.count,
        prevIncome: prevMonth.income,
        prevExpense: prevMonth.expense,
        prevProfit: prevMonth.profit,
      },
      series,
      expenseByCategory,
      lastTransactions: lastTx,
      budgetsAtRisk,
      debtsSummary: { iOweRemaining, owedToMeRemaining },
    })
  } catch (e) {
    return serverError(e)
  }
}
