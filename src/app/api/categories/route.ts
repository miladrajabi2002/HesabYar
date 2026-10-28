import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { categoryCreateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** GET /api/categories — لیست دسته‌ها با تعداد تراکنش */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const [categories, txCounts, budgetCounts] = await Promise.all([
      db.category.findMany({ orderBy: [{ type: "desc" }, { name: "asc" }] }),
      db.transaction.groupBy({ by: ["categoryId"], _count: { _all: true } }),
      db.budget.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    ])
    const txMap = new Map(txCounts.filter((c) => c.categoryId).map((c) => [c.categoryId as string, c._count._all]))
    const budgetMap = new Map(budgetCounts.map((c) => [c.categoryId, c._count._all]))
    return ok({
      categories: categories.map((c) => ({
        ...c,
        transactionCount: txMap.get(c.id) ?? 0,
        budgetCount: budgetMap.get(c.id) ?? 0,
      })),
    })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/categories — ایجاد دسته */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, categoryCreateSchema)
    if (error) return error

    const dup = await db.category.findFirst({ where: { name: data.name, type: data.type } })
    if (dup) return fail("دسته‌ای با همین نام و نوع از قبل وجود دارد", 409)

    const category = await db.category.create({ data })
    return ok({ category }, { status: 201 })
  } catch (e) {
    return serverError(e)
  }
}
