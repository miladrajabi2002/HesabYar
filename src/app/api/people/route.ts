import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, parseQuery, requireApiAuth, serverError } from "@/lib/api-helpers"
import { personCreateSchema, personFilterSchema } from "@/lib/validation"
import { getPersonBalance } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/people — لیست اشخاص با تراز + فیلتر نقش/جستجو */
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
              OR: [
                { name: { contains: f.q } },
                { company: { contains: f.q } },
                { phone: { contains: f.q } },
                { shopAddress: { contains: f.q } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    })

    const withBalance = await Promise.all(
      people.map(async (p) => ({ ...p, balance: await getPersonBalance(p.id) }))
    )
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
