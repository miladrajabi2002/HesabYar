import { NextRequest } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { uploadsDir } from "@/lib/storage"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { personUpdateSchema } from "@/lib/validation"
import { getPersonBalance, openBalanceDays } from "@/lib/finance"
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
    // قدمت مانده: قدیمی‌ترین فاکتور مانده‌دار در جهت تراز (حلقهٔ آواتار)
    const oldestOpen =
      balance === 0
        ? null
        : await db.invoice.findFirst({
            where: { personId: id, type: balance > 0 ? "SALE" : "PURCHASE", credit: { gt: 0 } },
            orderBy: { date: "asc" },
            select: { date: true },
          })
    const openDays = openBalanceDays(balance, {
      salesTotal: 0,
      purchaseTotal: 0,
      saleOpenSince: balance > 0 ? oldestOpen?.date ?? null : null,
      purchaseOpenSince: balance < 0 ? oldestOpen?.date ?? null : null,
    })
    return ok({ person, balance, openDays, invoices, checks, settlements })
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
    // پیوست‌های تصویری شخص هم پاک شوند تا یتیم نمانند
    const atts = await db.attachment.findMany({ where: { refType: "PERSON", refId: id }, select: { id: true } })
    if (atts.length > 0) {
      await db.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } })
    }
    await db.person.delete({ where: { id } })
    // حذف فایل‌ها خارج از تراکنش — خطایش بحرانی نیست
    for (const a of atts) {
      try {
        fs.unlinkSync(path.join(uploadsDir(), a.id))
      } catch {
        /* فایل از قبل نبود */
      }
    }
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
