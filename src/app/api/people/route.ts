import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { searchVariants } from "@/lib/search-text"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { personCreateSchema, personFilterSchema } from "@/lib/validation"
import { getPersonActivity, getPersonBalances, openBalanceDays } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/people — لیست اشخاص با تراز، حجم خرید/فروش و قدمت مانده + فیلتر نقش/جستجو */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data: f, error } = parseQuery(req, personFilterSchema)
    if (error) return error

    const people = await db.person.findMany({
      where: {
        isArchived: false,
        ...(f.role ? { role: f.role } : {}),
        ...(f.q
          ? {
              // ي/ك عربی و ارقام فارسی/لاتین یکی دیده می‌شوند
              OR: searchVariants(f.q).flatMap((v) => [
                { name: { contains: v } },
                { company: { contains: v } },
                { phone: { contains: v } },
                { shopAddress: { contains: v } },
              ]),
            }
          : {}),
      },
      orderBy: { name: "asc" },
    })

    const [balances, activity] = await Promise.all([getPersonBalances(), getPersonActivity()])
    const now = new Date()
    const withBalance = people.map((p) => {
      const balance = balances.get(p.id) ?? 0
      const a = activity.get(p.id)
      return {
        ...p,
        balance,
        salesTotal: a?.salesTotal ?? 0,
        purchaseTotal: a?.purchaseTotal ?? 0,
        openDays: openBalanceDays(balance, a, now),
      }
    })
    const filtered = f.onlyWithBalance ? withBalance.filter((p) => p.balance !== 0) : withBalance
    filtered.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    return ok({ people: filtered })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/people — افزودن شخص */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, personCreateSchema)
    if (error) return error
    const person = await db.person.create({ data })
    return ok({ person })
  } catch (e) {
    return serverError(e)
  }
}
