import { NextRequest } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { uploadsDir } from "@/lib/storage"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { personUpdateSchema } from "@/lib/validation"
import { getPersonBalance, openBalanceDays } from "@/lib/finance"
import { settlementInclude } from "@/lib/includes"
import { buildStatement } from "@/lib/statement"
import { itemsGrossProfit } from "@/lib/finance-math"
import { jalaliOf, startOfJalaliDay } from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** GET /api/people/[id] — پروفایل کامل: تراز، دفتر حساب، فاکتورها، چک‌ها، تسویه‌ها، کالاها و گزارش‌ها */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const person = await db.person.findUnique({ where: { id } })
    if (!person) return fail("شخص پیدا نشد", 404)

    const [balance, invoices, checks, settlements, items] = await Promise.all([
      getPersonBalance(id),
      db.invoice.findMany({
        where: { personId: id },
        orderBy: { date: "desc" },
        select: {
          id: true,
          number: true,
          type: true,
          date: true,
          subtotal: true,
          discount: true,
          total: true,
          paidCash: true,
          paidChecks: true,
          credit: true,
          status: true,
          note: true,
          _count: { select: { items: true } },
        },
      }),
      db.checkPaper.findMany({
        where: { personId: id },
        orderBy: { dueDate: "desc" },
        include: {
          invoice: { select: { id: true, number: true, type: true } },
          account: { select: { id: true, name: true, bankKey: true } },
        },
      }),
      db.settlement.findMany({
        where: { personId: id },
        orderBy: { date: "desc" },
        include: settlementInclude,
      }),
      db.invoiceItem.findMany({
        where: { invoice: { personId: id } },
        select: {
          productId: true,
          productName: true,
          unit: true,
          quantity: true,
          unitPrice: true,
          costPrice: true,
          total: true,
          invoice: { select: { type: true, date: true } },
        },
      }),
    ])

    // قدمت مانده: قدیمی‌ترین فاکتور مانده‌دار در جهت تراز (حلقهٔ آواتار)
    const oldestOpen =
      balance === 0
        ? undefined
        : invoices
            .filter((i) => i.type === (balance > 0 ? "SALE" : "PURCHASE") && i.credit > 0)
            .reduce<Date | undefined>((m, i) => (!m || i.date < m ? i.date : m), undefined)
    const openDays = openBalanceDays(balance, {
      salesTotal: 0,
      purchaseTotal: 0,
      saleOpenSince: balance > 0 ? oldestOpen ?? null : null,
      purchaseOpenSince: balance < 0 ? oldestOpen ?? null : null,
    })

    // ── دفتر حساب (همان قواعد صورتحساب PDF) — جدیدترین بالا ──
    const accountBySettlement = new Map(settlements.map((s) => [s.id, s.account?.name ?? null]))
    const statement = buildStatement({
      openingBalance: person.openingBalance,
      openingDate: person.createdAt,
      invoices: invoices.map((i) => ({ ...i, itemCount: i._count.items })),
      settlements: settlements.map((s) => ({
        id: s.id,
        direction: s.direction,
        method: s.method,
        amount: s.amount,
        date: s.date,
        note: s.note?.replace(/\s*\(ref:[^)]*\)/, "") || null,
        invoiceNumber: s.invoice?.number ?? null,
      })),
    })
    const ledger = statement.rows
      .map((r) => ({
        ...r,
        account: r.ref?.type === "settlement" ? accountBySettlement.get(r.ref.id) ?? null : null,
      }))
      .reverse()

    // ── گزارش‌ها ──
    const sales = invoices.filter((i) => i.type === "SALE")
    const purchases = invoices.filter((i) => i.type === "PURCHASE")
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
    const paidAt = (i: { total: number; paidCash: number; paidChecks: number }) =>
      Math.min(i.total, i.paidCash + i.paidChecks)
    const receives = settlements.filter((s) => s.direction === "RECEIVE")
    const pays = settlements.filter((s) => s.direction === "PAY")
    const saleItems = items.filter((i) => i.invoice.type === "SALE")
    const profit = Math.round(itemsGrossProfit(saleItems)) - sum(sales.map((i) => i.discount))

    const today = startOfJalaliDay(new Date())
    const pending = checks.filter((c) => c.status === "PENDING")
    const pick = (list: typeof checks) => ({ count: list.length, sum: sum(list.map((c) => c.amount)) })
    const receivedDone = checks.filter((c) => c.direction === "RECEIVED" && (c.status === "CASHED" || c.status === "BOUNCED"))
    const bouncedReceived = receivedDone.filter((c) => c.status === "BOUNCED").length
    const nextDue = pending
      .filter((c) => c.dueDate >= today)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]

    const dealDates = [...invoices.map((i) => i.date), ...settlements.map((s) => s.date)]
    const stats = {
      salesTotal: sum(sales.map((i) => i.total)),
      salesCount: sales.length,
      purchaseTotal: sum(purchases.map((i) => i.total)),
      purchaseCount: purchases.length,
      saleDiscounts: sum(sales.map((i) => i.discount)),
      profit,
      receivedTotal: sum(sales.map(paidAt)) + sum(receives.map((s) => s.amount)),
      paidTotal: sum(purchases.map(paidAt)) + sum(pays.map((s) => s.amount)),
      saleOpen: { count: sales.filter((i) => i.credit > 0).length, sum: sum(sales.map((i) => i.credit)) },
      purchaseOpen: {
        count: purchases.filter((i) => i.credit > 0).length,
        sum: sum(purchases.map((i) => i.credit)),
      },
      avgSale: sales.length ? Math.round(sum(sales.map((i) => i.total)) / sales.length) : 0,
      avgPurchase: purchases.length ? Math.round(sum(purchases.map((i) => i.total)) / purchases.length) : 0,
      firstDeal: dealDates.length ? new Date(Math.min(...dealDates.map((d) => d.getTime()))) : null,
      lastDeal: dealDates.length ? new Date(Math.max(...dealDates.map((d) => d.getTime()))) : null,
      lastSale: sales[0]?.date ?? null,
      lastPurchase: purchases[0]?.date ?? null,
      checks: {
        pendingReceived: pick(pending.filter((c) => c.direction === "RECEIVED")),
        pendingIssued: pick(pending.filter((c) => c.direction === "ISSUED")),
        overdue: pick(pending.filter((c) => c.dueDate < today)),
        cashed: pick(checks.filter((c) => c.status === "CASHED")),
        bounced: pick(checks.filter((c) => c.status === "BOUNCED")),
        // خوش‌حسابی چک‌های دریافتی: درصد پاس‌شده از چک‌های تعیین‌تکلیف‌شده
        reliability: receivedDone.length
          ? Math.round(((receivedDone.length - bouncedReceived) / receivedDone.length) * 100)
          : null,
        nextDue: nextDue
          ? { id: nextDue.id, amount: nextDue.amount, dueDate: nextDue.dueDate, direction: nextDue.direction }
          : null,
      },
    }

    // ── گردش ۱۲ ماه اخیر ──
    const nowJ = jalaliOf(new Date())
    const curIdx = nowJ.jy * 12 + (nowJ.jm - 1)
    const monthly = Array.from({ length: 12 }, (_, k) => {
      const idx = curIdx - 11 + k
      return { key: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`, sales: 0, purchases: 0, received: 0, paid: 0 }
    })
    const slot = (d: Date) => {
      const j = jalaliOf(d)
      const k = j.jy * 12 + (j.jm - 1) - (curIdx - 11)
      return k >= 0 && k < 12 ? monthly[k] : null
    }
    for (const i of invoices) {
      const m = slot(i.date)
      if (!m) continue
      if (i.type === "SALE") {
        m.sales += i.total
        m.received += paidAt(i)
      } else {
        m.purchases += i.total
        m.paid += paidAt(i)
      }
    }
    for (const s of settlements) {
      const m = slot(s.date)
      if (!m) continue
      if (s.direction === "RECEIVE") m.received += s.amount
      else m.paid += s.amount
    }

    // ── کالاها: چه چیزی از ما خریده / به ما فروخته ──
    type ProductRow = {
      productId: string
      name: string
      unit: string
      quantity: number
      total: number
      lines: number
      lastPrice: number
      lastDate: Date
      profit: number
    }
    const groups: Record<"SALE" | "PURCHASE", Map<string, ProductRow>> = { SALE: new Map(), PURCHASE: new Map() }
    for (const it of items) {
      const g = groups[it.invoice.type === "SALE" ? "SALE" : "PURCHASE"]
      const row = g.get(it.productId) ?? {
        productId: it.productId,
        name: it.productName,
        unit: it.unit,
        quantity: 0,
        total: 0,
        lines: 0,
        lastPrice: it.unitPrice,
        lastDate: it.invoice.date,
        profit: 0,
      }
      row.quantity += it.quantity
      row.total += it.total
      row.lines += 1
      if (it.invoice.type === "SALE") row.profit += (it.unitPrice - (it.costPrice || 0)) * it.quantity
      if (it.invoice.date >= row.lastDate) {
        row.lastDate = it.invoice.date
        row.lastPrice = it.unitPrice
        row.name = it.productName
      }
      g.set(it.productId, row)
    }
    const byTotal = (m: Map<string, ProductRow>) =>
      [...m.values()].sort((a, b) => b.total - a.total).map((r) => ({ ...r, profit: Math.round(r.profit) }))
    const products = { sold: byTotal(groups.SALE), bought: byTotal(groups.PURCHASE) }

    return ok({
      person,
      balance,
      openDays,
      invoices: invoices.map(({ _count, ...i }) => ({ ...i, itemCount: _count.items })),
      checks,
      settlements,
      ledger,
      stats,
      monthly,
      products,
    })
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
