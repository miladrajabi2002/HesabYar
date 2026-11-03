import { NextRequest } from "next/server"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { getPersonBalances } from "@/lib/finance"
import { normalizeDigits } from "@/lib/digits"
import { foldSearchText, searchVariants } from "@/lib/search-text"

export const dynamic = "force-dynamic"

const SCOPES = ["invoices", "people", "products", "checks"] as const
type Scope = (typeof SCOPES)[number]

/**
 * GET /api/search?q=…&scope=… — جستجوی سراسری یکپارچه (ADV-01)
 * هم‌زمان بین فاکتور، شخص، کالا و چک.
 *  • ي/ك عربی و ارقام فارسی/لاتین یکی دیده می‌شوند (searchVariants)
 *  • بدون scope: از هر دسته ۵ نتیجه؛ با scope: فقط همان دسته و تا ۲۰ نتیجه
 *  • more.<دسته> = نتیجهٔ بیشتری هست (برای «نمایش همه»)
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const url = new URL(req.url)
    const raw = url.searchParams.get("q")?.trim() ?? ""
    const scopeParam = url.searchParams.get("scope")
    const scope = SCOPES.includes(scopeParam as Scope) ? (scopeParam as Scope) : null
    const empty = { invoices: [], people: [], products: [], checks: [], more: {} }
    if (raw.length < 2) return ok(empty)

    const variants = searchVariants(raw)
    const contains = (field: string) => variants.map((v) => ({ [field]: { contains: v } }))
    const personName = variants.map((v) => ({ person: { name: { contains: v } } }))
    const limit = scope ? 20 : 5
    const want = (s: Scope) => !scope || scope === s

    // فقط وقتی عبارت عددی است (مثلاً «۱۲۴» یا «۱٬۵۰۰٬۰۰۰») به‌عنوان شماره/مبلغ جستجو می‌شود
    const qLatin = normalizeDigits(raw)
    const numeric = /^[\d\s,٬.#-]+$/.test(qLatin)
    const numberQuery = numeric ? Number(qLatin.replace(/[^\d]/g, "")) : NaN
    const hasNumber = Number.isFinite(numberQuery) && numberQuery > 0

    const [people, products, invoices, checks, personBalances] = await Promise.all([
      want("people")
        ? db.person.findMany({
            where: {
              isArchived: false,
              OR: [...contains("name"), ...contains("phone"), ...contains("company")],
            },
            select: { id: true, name: true, phone: true, company: true, role: true },
            take: 40,
          })
        : [],
      want("products")
        ? db.product.findMany({
            where: {
              isArchived: false,
              OR: [...contains("name"), ...contains("brand"), ...contains("code")],
            },
            select: { id: true, name: true, brand: true, code: true, unit: true },
            take: 40,
          })
        : [],
      want("invoices")
        ? db.invoice.findMany({
            where: {
              OR: [
                ...(hasNumber ? [{ number: numberQuery }, { total: numberQuery }] : []),
                ...personName,
                ...variants.map((v) => ({ items: { some: { productName: { contains: v } } } })),
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
            take: limit + 1,
          })
        : [],
      want("checks")
        ? db.checkPaper.findMany({
            where: {
              OR: [...contains("serial"), ...personName, ...(hasNumber ? [{ amount: numberQuery }] : [])],
            },
            orderBy: { dueDate: "desc" },
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
            take: 40,
          })
        : [],
      want("people") ? getPersonBalances() : new Map<string, number>(),
    ])

    // نام‌هایی که با عبارت شروع می‌شوند بالاتر؛ بعد کوتاه‌تر (دقیق‌تر)
    const q = foldSearchText(raw)
    const rank = (name: string) => {
      const n = foldSearchText(name)
      return n.startsWith(q) ? 0 : n.includes(` ${q}`) ? 1 : 2
    }
    const byName = <T extends { name: string }>(a: T, b: T) =>
      rank(a.name) - rank(b.name) || a.name.length - b.name.length
    people.sort(byName)
    products.sort(byName)
    // چک‌های در جریان اول (نزدیک‌ترین سررسید)، بعد بقیه از تازه به قدیم
    checks.sort((a, b) => {
      const ap = a.status === "PENDING" ? 0 : 1
      const bp = b.status === "PENDING" ? 0 : 1
      if (ap !== bp) return ap - bp
      return ap === 0
        ? a.dueDate.getTime() - b.dueDate.getTime()
        : b.dueDate.getTime() - a.dueDate.getTime()
    })

    return ok({
      invoices: invoices.slice(0, limit),
      people: people.slice(0, limit).map((p) => ({
        ...p,
        balance: personBalances.get(p.id) ?? 0,
      })),
      products: products.slice(0, limit),
      checks: checks.slice(0, limit),
      more: {
        invoices: invoices.length > limit,
        people: people.length > limit,
        products: products.length > limit,
        checks: checks.length > limit,
      },
    })
  } catch (e) {
    return serverError(e)
  }
}
