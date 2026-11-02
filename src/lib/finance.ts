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

/** تراز همه حساب‌های فعال — IMP-06: با دو groupBy به‌جای N+1 */
export async function getAccountBalances(): Promise<
  {
    id: string
    name: string
    bankKey: string
    accountNumber: string | null
    cardNumber: string | null
    initialBalance: number
    balance: number
  }[]
> {
  const accounts = await db.account.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
    // FIX: شبا (accountNumber) و شماره کارت هم برگردند تا فرم ویرایش خالی نباشد
    select: {
      id: true,
      name: true,
      bankKey: true,
      accountNumber: true,
      cardNumber: true,
      initialBalance: true,
    },
  })
  const [ins, outs] = await Promise.all([
    db.transaction.groupBy({
      by: ["accountId"],
      where: { direction: "IN" },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["accountId"],
      where: { direction: "OUT" },
      _sum: { amount: true },
    }),
  ])
  const inMap = new Map(ins.map((g) => [g.accountId, g._sum.amount ?? 0]))
  const outMap = new Map(outs.map((g) => [g.accountId, g._sum.amount ?? 0]))
  return accounts.map((a) => ({
    ...a,
    balance: a.initialBalance + (inMap.get(a.id) ?? 0) - (outMap.get(a.id) ?? 0),
  }))
}

// ───────────────────────── تراز اشخاص ─────────────────────────

/**
 * تراز شخص: مثبت = شخص به ما بدهکار است (طلب ما)
 *          منفی = ما به شخص بدهکاریم (بدهی ما)
 * فرمول: مانده اولیه شخص
 *        + مانده فاکتورهای فروش − مانده فاکتورهای خرید
 *        − تسویه‌های دریافتِ آزاد + تسویه‌های پرداختِ آزاد
 * توجه: تسویه‌ی متصل به فاکتور، خودش در مانده فاکتور لحاظ شده است
 *       و نباید دوباره شمرده شود (جلوگیری از دوبرابرشماری).
 * مانده اولیه: حساب قدیمی شخص قبل از شروع کار با برنامه
 * (مثبت = شخص از قبل به ما بدهکار بود؛ منفی = ما بدهکار بودیم)
 */
export async function getPersonBalance(personId: string): Promise<number> {
  const person = await db.person.findUnique({
    where: { id: personId },
    select: { openingBalance: true },
  })
  const [saleCredits, purchaseCredits, receives, pays] = await Promise.all([
    db.invoice.aggregate({
      where: { personId, type: "SALE" },
      _sum: { credit: true },
    }),
    db.invoice.aggregate({
      where: { personId, type: "PURCHASE" },
      _sum: { credit: true },
    }),
    db.settlement.aggregate({
      where: { personId, direction: "RECEIVE", invoiceId: null },
      _sum: { amount: true },
    }),
    db.settlement.aggregate({
      where: { personId, direction: "PAY", invoiceId: null },
      _sum: { amount: true },
    }),
  ])
  return (
    (person?.openingBalance ?? 0) +
    (saleCredits._sum.credit ?? 0) -
    (purchaseCredits._sum.credit ?? 0) -
    (receives._sum.amount ?? 0) +
    (pays._sum.amount ?? 0)
  )
}

/** تراز همه اشخاص فعال — IMP-06: با groupBy به‌جای ۴×N کوئری (+ مانده اولیه) */
export async function getPersonBalances(): Promise<Map<string, number>> {
  const [people, saleCredits, purchaseCredits, receives, pays] = await Promise.all([
    db.person.findMany({ select: { id: true, openingBalance: true } }),
    db.invoice.groupBy({
      by: ["personId"],
      where: { type: "SALE" },
      _sum: { credit: true },
    }),
    db.invoice.groupBy({
      by: ["personId"],
      where: { type: "PURCHASE" },
      _sum: { credit: true },
    }),
    db.settlement.groupBy({
      by: ["personId"],
      where: { direction: "RECEIVE", invoiceId: null },
      _sum: { amount: true },
    }),
    db.settlement.groupBy({
      by: ["personId"],
      where: { direction: "PAY", invoiceId: null },
      _sum: { amount: true },
    }),
  ])
  const map = new Map<string, number>()
  const add = (id: string, delta: number) => map.set(id, (map.get(id) ?? 0) + delta)
  // مانده اولیه (حساب قدیمی) هر شخص
  people.forEach((p) => {
    if (p.openingBalance) add(p.id, p.openingBalance)
  })
  saleCredits.forEach((g) => add(g.personId, g._sum.credit ?? 0))
  purchaseCredits.forEach((g) => add(g.personId, -(g._sum.credit ?? 0)))
  receives.forEach((g) => add(g.personId, -(g._sum.amount ?? 0)))
  pays.forEach((g) => add(g.personId, g._sum.amount ?? 0))
  return map
}

// ───────────────────────── موجودی جنس ─────────────────────────

/** موجودی یک جنس = موجودی اولیه + مجموع خریدها − مجموع فروش‌ها */
export async function getProductStock(productId: string): Promise<number> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { initialStock: true },
  })
  const purchases = await db.invoiceItem.aggregate({
    where: { productId, invoice: { type: "PURCHASE" } },
    _sum: { quantity: true },
  })
  const sales = await db.invoiceItem.aggregate({
    where: { productId, invoice: { type: "SALE" } },
    _sum: { quantity: true },
  })
  return (product?.initialStock ?? 0) + (purchases._sum.quantity ?? 0) - (sales._sum.quantity ?? 0)
}

/** موجودی همه اجناس به صورت یکجا (شامل موجودی اولیه؛ کارآمدتر: یک کوئری روی اجناس و یک کوئری روی اقلام) */
export async function getProductStocks(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  // موجودی اولیه هر جنس (ثبت‌شده هنگام افزودن جنس)
  const products = await db.product.findMany({ select: { id: true, initialStock: true } })
  for (const p of products) {
    if (p.initialStock) map.set(p.id, p.initialStock)
  }
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
 * میانگین موزون قیمت تمام‌شده یک جنس تا لحظه مشخص (برای قیمت تمام‌شده فروش).
 * موجودی اولیه ثبت‌شده هنگام افزودن جنس هم با قیمت خریدش در میانگین لحاظ می‌شود،
 * بنابراین فروش از روی موجودی اولیه سود درست محاسبه می‌کند (نه سود ۱۰۰٪).
 * اگر نه موجودی اولیه‌ای باشد و نه سابقه خرید، صفر برمی‌گردد.
 */
export async function getAveragePurchasePrice(productId: string, untilDate?: Date): Promise<number> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { initialStock: true, initialStockCostPrice: true },
  })
  const items = await db.invoiceItem.findMany({
    where: {
      productId,
      invoice: { type: "PURCHASE", ...(untilDate ? { date: { lte: untilDate } } : {}) },
    },
    select: { quantity: true, unitPrice: true },
  })
  const purchasedQty = items.reduce((s, i) => s + i.quantity, 0)
  const purchasedCost = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  // موجودی اولیه قبل از همه خریدهاست، پس همیشه در میانگین لحاظ می‌شود
  const initialQty = product?.initialStock ?? 0
  const initialCost = initialQty * (product?.initialStockCostPrice ?? 0)
  const totalQty = initialQty + purchasedQty
  if (totalQty <= 0) return 0
  return Math.round((initialCost + purchasedCost) / totalQty)
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
      _sum: { total: true, discount: true },
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
  // سود = Σ(قیمت فروش − قیمت تمام‌شده) روی اقلام فروش − تخفیف فاکتورهای فروش
  // (تخفیف از درآمد کم شده؛ اگر از سود کم نشود سود بیشتر از واقع گزارش می‌شود)
  const saleItems = await db.invoiceItem.findMany({
    where: { invoice: { type: "SALE", date: { gte: start, lte: end } } },
    select: { quantity: true, unitPrice: true, costPrice: true },
  })
  const profit =
    saleItems.reduce((s, i) => s + (i.unitPrice - i.costPrice) * i.quantity, 0) - (sales._sum.discount ?? 0)
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
  // مبالغ از «مبلغ نهایی فاکتور» (بعد از تخفیف) — هماهنگ با کارت‌های خلاصه؛
  // سود از اقلام منهای تخفیف همان فاکتور
  const invoices = await db.invoice.findMany({
    where: { date: { gte: start, lte: end } },
    select: {
      type: true,
      date: true,
      total: true,
      discount: true,
      items: { select: { quantity: true, unitPrice: true, costPrice: true } },
    },
  })
  const map = new Map<string, { sales: number; purchases: number; profit: number }>()
  for (const inv of invoices) {
    const day = jalaliDayKey(inv.date)
    const entry = map.get(day) || { sales: 0, purchases: 0, profit: 0 }
    if (inv.type === "SALE") {
      entry.sales += inv.total
      entry.profit +=
        inv.items.reduce((s, i) => s + (i.unitPrice - i.costPrice) * i.quantity, 0) - inv.discount
    } else {
      entry.purchases += inv.total
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
