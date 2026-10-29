import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { personUpdateSchema } from "@/lib/validation"
import { getPersonBalance } from "@/lib/finance"
import { settlementInclude } from "@/lib/includes"

export const dynamic = "force-dynamic"

/** GET /api/people/[id] — پروفایل کامل: تراز، فاکتورها، چک‌ها، تسویه‌ها */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const person = await db.person.findUnique({ where: { id } })
    if (!person) return fail("شخص پیدا نشد", 404)

    const [balance, invoices, checks, settlements] = await Promise.all([
      getPersonBalance(id),
      db.invoice.findMany({
        where: { personId: id },
        orderBy: { date: "desc" },
        take: 50,
        include: { items: true, checks: true, settlements: true },
      }),
      db.checkPaper.findMany({
        where: { personId: id },
        orderBy: { dueDate: "desc" },
        include: { invoice: { select: { id: true, number: true, type: true } } },
      }),
      db.settlement.findMany({
        where: { personId: id },
        orderBy: { date: "desc" },
        take: 50,
        include: settlementInclude,
      }),
    ])
    return ok({ person, balance, invoices, checks, settlements })
  } catch (e) {
    return serverError(e)
  }
}

/** PATCH /api/people/[id] — ویرایش شخص */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const { data, error } = await parseBody(req, personUpdateSchema)
    if (error) return error
    const exists = await db.person.findUnique({ where: { id } })
    if (!exists) return fail("شخص پیدا نشد", 404)
    const person = await db.person.update({ where: { id }, data })
    return ok({ person })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/people/[id] — فقط اگر سابقه نداشته باشد */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const [inv, chk, st] = await Promise.all([
      db.invoice.count({ where: { personId: id } }),
      db.checkPaper.count({ where: { personId: id } }),
      db.settlement.count({ where: { personId: id } }),
    ])
    if (inv + chk + st > 0) {
      return fail("این شخص سابقه فاکتور/چک/تسویه دارد؛ فقط می‌توانید بایگانی‌اش کنید", 400)
    }
    await db.person.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
