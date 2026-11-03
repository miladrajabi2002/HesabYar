import { NextRequest } from "next/server"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { getPersonBalances } from "@/lib/finance"
import { normalizeDigits } from "@/lib/digits"

export const dynamic = "force-dynamic"

/**
 * GET /api/search?q=… — جستجوی سراسری یکپارچه (ADV-01)
 * هم‌زمان بین فاکتور، شخص، کالا، چک و شماره‌ها.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const raw = new URL(req.url).searchParams.get("q")?.trim() ?? ""
    if (raw.length < 2) return ok({ invoices: [], people: [], products: [], checks: [] })
    const q = raw
    const qLatin = normalizeDigits(q) // ارقام فارسی → لاتین برای جستجوی شماره‌ای

    const [people, products, personBalances] = await Promise.all([
      db.person.findMany({
        where: {
          isArchived: false,
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { phone: { contains: qLatin } },
            { company: { contains: q } },
          ],
        },
        select: { id: true, name: true, phone: true, company: true, role: true },
        take: 6,
      }),
      db.product.findMany({
        where: {
          isArchived: false,
          OR: [
            { name: { contains: q } },
            { brand: { contains: q } },
            { code: { contains: q } },
            { code: { contains: qLatin } },
          ],
        },
        select: { id: true, name: true, brand: true, unit: true },
        take: 6,
      }),
      getPersonBalances(),
    ])

    // فاکتور: شماره فاکتور (لاتین) یا نام شخص
    const numberQuery = Number(qLatin.replace(/[^\d]/g, ""))
    const invoices = await db.invoice.findMany({
      where: {
        OR: [
          ...(Number.isFinite(numberQuery) && numberQuery > 0
            ? [{ number: numberQuery }]
            : []),
          { person: { name: { contains: q } } },
        ],
      },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      select: {
        id: true,
        number: true,
        type: true,
        total: true,
        credit: true,
        date: true,
        person: { select: { name: true } },
      },
      take: 6,
    })

    // چک: سریال، نام شخص یا مبلغ
    const checks = await db.checkPaper.findMany({
      where: {
        OR: [
          { serial: { contains: q } },
          { serial: { contains: qLatin } },
          { person: { name: { contains: q } } },
          ...(Number.isFinite(numberQuery) && numberQuery > 0
            ? [{ amount: numberQuery }]
            : []),
        ],
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        serial: true,
        amount: true,
        bankKey: true,
        status: true,
        direction: true,
        dueDate: true,
        person: { select: { name: true } },
      },
      take: 6,
    })

    return ok({
      invoices,
      people: people.map((p) => ({
        ...p,
        balance: personBalances.get(p.id) ?? 0,
      })),
      products,
      checks,
    })
  } catch (e) {
    return serverError(e)
  }
}
