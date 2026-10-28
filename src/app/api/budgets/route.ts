import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { budgetCreateSchema } from "@/lib/validation"
import { currentMonthKey, monthKeyRange, monthKeyLabel } from "@/lib/jalali"
import { getExpenseByCategory } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/budgets?monthJalali=1404-08 — بودجه‌های ماه با میزان مصرف */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const url = new URL(req.url)
    const month = url.searchParams.get("monthJalali") || currentMonthKey()
    const { start, end } = monthKeyRange(month)

    const [budgets, spentMap] = await Promise.all([
      db.budget.findMany({ where: { monthJalali: month }, include: { category: true }, orderBy: { createdAt: "asc" } }),
      getExpenseByCategory(start, end),
    ])

    let totalAmount = 0
    let totalSpent = 0
    const list = budgets.map((b) => {
      const spent = spentMap.get(b.categoryId) ?? 0
      totalAmount += b.amount
      totalSpent += spent
      const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0
      return {
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        amount: b.amount,
        monthJalali: b.monthJalali,
        alertThreshold: b.alertThreshold,
        spent,
        remaining: b.amount - spent,
        percent: Math.round(percent * 10) / 10,
      }
    })

    return ok({
      monthJalali: month,
      monthLabel: monthKeyLabel(month),
      budgets: list,
      summary: {
        totalAmount,
        totalSpent,
        totalRemaining: totalAmount - totalSpent,
        percent: totalAmount > 0 ? Math.round((totalSpent / totalAmount) * 1000) / 10 : 0,
      },
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/budgets — ایجاد بودجه برای یک ماه شمسی */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, budgetCreateSchema)
    if (error) return error

    const category = await db.category.findUnique({ where: { id: data.categoryId } })
    if (!category) return fail("دسته یافت نشد", 400)
    if (category.type !== "EXPENSE") return fail("بودجه فقط برای دسته‌های هزینه قابل تعیین است", 400)

    const dup = await db.budget.findUnique({
      where: { categoryId_monthJalali: { categoryId: data.categoryId, monthJalali: data.monthJalali } },
    })
    if (dup) return fail("برای این دسته در این ماه قبلاً بودجه ثبت شده است", 409)

    const budget = await db.budget.create({ data })
    return ok({ budget }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
