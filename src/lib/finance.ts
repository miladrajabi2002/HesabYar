/**
 * منطق مالی فروشگاه — lib/finance.ts
 * تراز حساب‌های بانکی، تراز اشخاص (طلب/بدهی)، موجودی کالا، سود و شماره فاکتور.
 * تنها مرجع محاسبه مانده‌ها برای جلوگیری از ناسازگاری.
 */
import { db } from "@/lib/db"
import { jalaliDayKey, startOfJalaliDay } from "@/lib/jalali"
import {
  accountBalance,
  collectionBreakdown,
  itemsGrossProfit,
  paymentSplit,
  personBalance,
  stockLevel,
  weightedAverageCost,
} from "@/lib/finance-math"

export { itemsSubtotal } from "@/lib/finance-math"

// ───────────────────────── حساب‌های بانکی ─────────────────────────

/** تراز یک حساب بانکی = مانده اولیه + واریز − برداشت */
export async function getAccountBalance(accountId: string): Promise<number> {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { initialBalance: true } })
  if (!account) return 0
  const ins = await db.transaction.aggregate({
    where: { accountId, direction: "IN" },
    _sum: { amount: true },
  })
  const outs = await db.transaction.aggregate({
    where: { accountId, direction: "OUT" },
    _sum: { amount: true },
  })
  return accountBalance(account.initialBalance, ins._sum.amount ?? 0, outs._sum.amount ?? 0)
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
    balance: accountBalance(a.initialBalance, inMap.get(a.id) ?? 0, outMap.get(a.id) ?? 0),
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
  return personBalance({
    openingBalance: person?.openingBalance ?? 0,
    saleCredit: saleCredits._sum.credit ?? 0,
    purchaseCredit: purchaseCredits._sum.credit ?? 0,
    freeReceives: receives._sum.amount ?? 0,
    freePays: pays._sum.amount ?? 0,
  })
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

/** نسیهٔ قدیمی‌تر از این تعداد روز «معوق» است (بنر فاکتورها + حلقهٔ اشخاص) */
export const OVERDUE_DAYS = 30

export interface PersonActivity {
  /** جمع فاکتورهای فروش به این شخص */
  salesTotal: number
  /** جمع فاکتورهای خرید از این شخص */
  purchaseTotal: number
  /** تاریخ قدیمی‌ترین فاکتور فروشِ هنوز مانده‌دار (طلب ما) */
  saleOpenSince: Date | null
  /** تاریخ قدیمی‌ترین فاکتور خریدِ هنوز مانده‌دار (بدهی ما) */
  purchaseOpenSince: Date | null
}

/** حجم خرید/فروش و قدمت قدیمی‌ترین نسیهٔ باز هر شخص — با دو groupBy */
export async function getPersonActivity(): Promise<Map<string, PersonActivity>> {
  const [totals, open] = await Promise.all([
    db.invoice.groupBy({ by: ["personId", "type"], _sum: { total: true } }),
    db.invoice.groupBy({ by: ["personId", "type"], where: { credit: { gt: 0 } }, _min: { date: true } }),
  ])
  const map = new Map<string, PersonActivity>()
  const get = (id: string) => {
    let a = map.get(id)
    if (!a) {
      a = { salesTotal: 0, purchaseTotal: 0, saleOpenSince: null, purchaseOpenSince: null }
      map.set(id, a)
    }
    return a
  }
  totals.forEach((g) => {
    if (g.type === "SALE") get(g.personId).salesTotal = g._sum.total ?? 0
    else get(g.personId).purchaseTotal = g._sum.total ?? 0
  })
  open.forEach((g) => {
    if (g.type === "SALE") get(g.personId).saleOpenSince = g._min.date
    else get(g.personId).purchaseOpenSince = g._min.date
  })
  return map
}

/**
 * چند روز است مانده‌ی شخص باز مانده — بر اساس قدیمی‌ترین فاکتورِ مانده‌دار در جهت تراز
 * (طلب ← فاکتور فروش، بدهی ← فاکتور خرید). مانده‌ای که فقط از «مانده اولیه» یا تسویهٔ آزاد
 * آمده فاکتوری ندارد → null.
 */
export function openBalanceDays(balance: number, activity: PersonActivity | undefined, now = new Date()): number | null {
  if (balance === 0 || !activity) return null
  const since = balance > 0 ? activity.saleOpenSince : activity.purchaseOpenSince
  if (!since) return null
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000))
}

// ───────────────────────── موجودی کالا ─────────────────────────

/** موجودی یک کالا = موجودی اولیه + مجموع خریدها − مجموع فروش‌ها */
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
  return stockLevel(product?.initialStock ?? 0, purchases._sum.quantity ?? 0, sales._sum.quantity ?? 0)
}

/** موجودی همه کالاها به صورت یکجا (شامل موجودی اولیه؛ کارآمدتر: یک کوئری روی کالاها و یک کوئری روی اقلام) */
export async function getProductStocks(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  // موجودی اولیه هر کالا (ثبت‌شده هنگام افزودن کالا)
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
 * میانگین موزون قیمت تمام‌شده یک کالا تا لحظه مشخص (برای قیمت تمام‌شده فروش).
 * موجودی اولیه ثبت‌شده هنگام افزودن کالا هم با قیمت خریدش در میانگین لحاظ می‌شود،
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
  // موجودی اولیه قبل از همه خریدهاست، پس همیشه در میانگین لحاظ می‌شود
  return weightedAverageCost(
    { quantity: product?.initialStock ?? 0, unitCost: product?.initialStockCostPrice ?? 0 },
    items
  )
}

// ───────────────────────── بازمحاسبه فاکتور ─────────────────────────

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
  const { credit, status } = paymentSplit({ total: invoice.total, paidCash: invoice.paidCash, paidChecks, settled })
  await db.invoice.update({
    where: { id: invoiceId },
    data: { paidChecks, credit, status },
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
  const profit = itemsGrossProfit(saleItems) - (sales._sum.discount ?? 0)
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
      entry.profit += itemsGrossProfit(inv.items) - inv.discount
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

/** وصول فروش بازه (نقد / چک / بعداً تسویه / هنوز نسیه) — برای نمودار دونات */
export async function salesCollection(start: Date, end: Date) {
  const invoices = await db.invoice.findMany({
    where: { type: "SALE", date: { gte: start, lte: end } },
    select: { total: true, paidCash: true, paidChecks: true, credit: true },
  })
  return collectionBreakdown(invoices)
}
