/**
 * منطق مالی فروشگاه — lib/finance.ts
 * تراز حساب‌های بانکی، تراز اشخاص (طلب/بدهی)، موجودی جنس، سود و شماره فاکتور.
 * تنها مرجع محاسبه مانده‌ها برای جلوگیری از ناسازگاری.
 */
import { db } from "@/lib/db"
import { jalaliDayKey, startOfJalaliDay } from "@/lib/jalali"

// ───────────────────────── حساب‌های بانکی ─────────────────────────

/** تراز یک حساب بانکی = مانده اولیه + واریز − برداشت */
export async function getAccountBalance(accountId: string): Promise<number> {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { initialBalance: true } })
  if (!account) return 0
  const agg = await db.transaction.aggregate({
    where: { accountId },
    _sum: { amount: true },
  })
  const ins = await db.transaction.aggregate({
    where: { accountId, direction: "IN" },
    _sum: { amount: true },
  })
  const outs = await db.transaction.aggregate({
    where: { accountId, direction: "OUT" },
    _sum: { amount: true },
  })
  return account.initialBalance + (ins._sum.amount ?? 0) - (outs._sum.amount ?? 0)
}

/** تراز همه حساب‌های فعال */
export async function getAccountBalances(): Promise<
  { id: string; name: string; bankKey: string; initialBalance: number; balance: number }[]
> {
  const accounts = await db.account.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, bankKey: true, initialBalance: true },
  })
  const result: { id: string; name: string; bankKey: string; initialBalance: number; balance: number }[] = []
  for (const a of accounts) {
    result.push({ ...a, balance: await getAccountBalance(a.id) })
  }
  return result
}

// ───────────────────────── تراز اشخاص ─────────────────────────

/**
 * تراز شخص: مثبت = شخص به ما بدهکار است (طلب ما)
 *          منفی = ما به شخص بدهکاریم (بدهی ما)
 * فرمول: +مانده فاکتورهای فروش − مانده فاکتورهای خرید
 *        − تسویه‌های دریافتِ آزاد + تسویه‌های پرداختِ آزاد
 * توجه: تسویه‌ی متصل به فاکتور، خودش در مانده فاکتور لحاظ شده است
 *       و نباید دوباره شمرده شود (جلوگیری از دوبرابرشماری).
 */
export async function getPersonBalance(personId: string): Promise<number> {
  const saleCredits = await db.invoice.aggregate({
    where: { personId, type: "SALE" },
    _sum: { credit: true },
  })
  const purchaseCredits = await db.invoice.aggregate({
    where: { personId, type: "PURCHASE" },
    _sum: { credit: true },
  })
  const receives = await db.settlement.aggregate({
    where: { personId, direction: "RECEIVE", invoiceId: null },
    _sum: { amount: true },
  })
  const pays = await db.settlement.aggregate({
    where: { personId, direction: "PAY", invoiceId: null },
    _sum: { amount: true },
  })
  return (
    (saleCredits._sum.credit ?? 0) -
    (purchaseCredits._sum.credit ?? 0) -
    (receives._sum.amount ?? 0) +
    (pays._sum.amount ?? 0)
  )
}

/** تراز همه اشخاص فعال، مرتب بر اساس بدهی/طلب مطلق */
export async function getPersonBalances(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const people = await db.person.findMany({ where: { isArchived: false }, select: { id: true } })
  for (const p of people) {
    map.set(p.id, await getPersonBalance(p.id))
  }
  return map
}

// ───────────────────────── موجودی جنس ─────────────────────────

/** موجودی یک جنس = مجموع خریدها − مجموع فروش‌ها */
export async function getProductStock(productId: string): Promise<number> {
  const purchases = await db.invoiceItem.aggregate({
    where: { productId, invoice: { type: "PURCHASE" } },
    _sum: { quantity: true },
  })
  const sales = await db.invoiceItem.aggregate({
    where: { productId, invoice: { type: "SALE" } },
    _sum: { quantity: true },
  })
  return (purchases._sum.quantity ?? 0) - (sales._sum.quantity ?? 0)
}

/** موجودی همه اجناس به صورت یکجا (کارآمدتر: یک کوئری روی اقلام) */
export async function getProductStocks(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const items = await db.invoiceItem.findMany({
    select: { productId: true, quantity: true, invoice: { select: { type: true } } },
  })
  for (const it of items) {
    const current = map.get(it.productId) ?? 0
    map.set(it.productId, current + (it.invoice.type === "PURCHASE" ? it.quantity : -it.quantity))
  }
  return map
}

// ───────────────────────── شماره فاکتور و قیمت تمام‌شده ─────────────────────────

/** شماره سریال فاکتور بعدی (۱واحد بیشتر از بزرگترین) */
export async function nextInvoiceNumber(): Promise<number> {
  const max = await db.invoice.aggregate({ _max: { number: true } })
  return (max._max.number ?? 1000) + 1
}

/**
 * میانگین موزون قیمت خرید یک جنس تا لحظه مشخص (برای قیمت تمام‌شده فروش).
 * اگر سابقه خرید نباشد صفر برمی‌گردد (سود کامل ثبت می‌شود).
 */
export async function getAveragePurchasePrice(productId: string, untilDate?: Date): Promise<number> {
  const items = await db.invoiceItem.findMany({
    where: {
      productId,
      invoice: { type: "PURCHASE", ...(untilDate ? { date: { lte: untilDate } } : {}) },
    },
    select: { quantity: true, unitPrice: true },
  })
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  if (totalQty <= 0) return 0
  const totalCost = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  return Math.round(totalCost / totalQty)
}

// ───────────────────────── بازمحاسبه فاکتور ─────────────────────────

/** جمع اقلام فاکتور */
export function itemsSubtotal(
  items: { quantity: number; unitPrice: number }[]
): number {
  return items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
}

/**
 * بازمحاسبه مانده فاکتور:
 *  paidChecks = مجموع چک‌های مرتبط سالم (نه برگشتی/لغو)
 *  credit = total − paidCash − paidChecks − تسویه‌های ثبت‌شده بابت فاکتور
 *  status = credit <= 0 ? SETTLED : OPEN
 */
export async function recomputeInvoice(invoiceId: string): Promise<void> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { total: true, paidCash: true },
  })
  if (!invoice) return
  const paidChecksAgg = await db.checkPaper.aggregate({
    where: { invoiceId, status: { in: ["PENDING", "CASHED"] } },
    _sum: { amount: true },
  })
  const settledAgg = await db.settlement.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  })
  const paidChecks = paidChecksAgg._sum.amount ?? 0
  const settled = settledAgg._sum.amount ?? 0
  const credit = Math.max(0, invoice.total - invoice.paidCash - paidChecks - settled)
  await db.invoice.update({
    where: { id: invoiceId },
    data: { paidChecks, credit, status: credit <= 0 ? "SETTLED" : "OPEN" },
  })
}

// ───────────────────────── گزارش سود ─────────────────────────

export interface PeriodSummary {
  sales: number
  purchases: number
  profit: number
  saleCount: number
  purchaseCount: number
  receivedChecks: number
  issuedChecks: number
}

/** خلاصه یک بازه: فروش/خرید/سود/چک‌ها */
export async function periodSummary(start: Date, end: Date): Promise<PeriodSummary> {
  const [sales, purchases, checks] = await Promise.all([
    db.invoice.aggregate({
      where: { type: "SALE", date: { gte: start, lte: end } },
      _sum: { total: true },
      _count: true,
    }),
    db.invoice.aggregate({
      where: { type: "PURCHASE", date: { gte: start, lte: end } },
      _sum: { total: true },
      _count: true,
    }),
    db.checkPaper.findMany({
      where: { dueDate: { gte: start, lte: end }, status: { in: ["PENDING", "CASHED"] } },
      select: { amount: true, direction: true },
    }),
  ])
  // سود = Σ(قیمت فروش − قیمت تمام‌شده) روی اقلام فروش
  const saleItems = await db.invoiceItem.findMany({
    where: { invoice: { type: "SALE", date: { gte: start, lte: end } } },
    select: { quantity: true, unitPrice: true, costPrice: true },
  })
  const profit = saleItems.reduce((s, i) => s + (i.unitPrice - i.costPrice) * i.quantity, 0)
  return {
    sales: sales._sum.total ?? 0,
    purchases: purchases._sum.total ?? 0,
    profit: Math.round(profit),
    saleCount: sales._count,
    purchaseCount: purchases._count,
    receivedChecks: checks.filter((c) => c.direction === "RECEIVED").reduce((s, c) => s + c.amount, 0),
    issuedChecks: checks.filter((c) => c.direction === "ISSUED").reduce((s, c) => s + c.amount, 0),
  }
}

/** سری روزانه فروش/خرید/سود برای نمودار (کلید روز شمسی) */
export async function dailySeries(start: Date, end: Date): Promise<
  { day: string; sales: number; purchases: number; profit: number }[]
> {
  const items = await db.invoiceItem.findMany({
    where: { invoice: { date: { gte: start, lte: end } } },
    select: {
      quantity: true,
      unitPrice: true,
      costPrice: true,
      total: true,
      invoice: { select: { type: true, date: true } },
    },
  })
  const map = new Map<string, { sales: number; purchases: number; profit: number }>()
  for (const it of items) {
    const day = jalaliDayKey(it.invoice.date)
    const entry = map.get(day) || { sales: 0, purchases: 0, profit: 0 }
    if (it.invoice.type === "SALE") {
      entry.sales += it.total
      entry.profit += (it.unitPrice - it.costPrice) * it.quantity
    } else {
      entry.purchases += it.total
    }
    map.set(day, entry)
  }
  // پر کردن روزهای خالی
  const days: { day: string; sales: number; purchases: number; profit: number }[] = []
  const cursor = startOfJalaliDay(start)
  const endDay = startOfJalaliDay(end)
  let guard = 0
  while (cursor.getTime() <= endDay.getTime() && guard < 400) {
    const day = jalaliDayKey(cursor)
    const e = map.get(day) || { sales: 0, purchases: 0, profit: 0 }
    days.push({ day, sales: e.sales, purchases: e.purchases, profit: Math.round(e.profit) })
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return days
}
