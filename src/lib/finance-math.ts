/**
 * فرمول‌های خالص مالی — lib/finance-math.ts
 * بدون دیتابیس و بدون وابستگی؛ هم سرور (finance.ts و API) و هم کلاینت (فرم فاکتور، لیست‌ها)
 * از همین‌ها استفاده می‌کنند تا عدد سود/مانده همه‌جا یکی باشد. تست: tests/finance.test.ts
 */

export interface PricedItem {
  quantity: number
  unitPrice: number
}

export interface CostedItem extends PricedItem {
  /** قیمت تمام‌شدهٔ لحظهٔ فروش */
  costPrice: number
}

/** جمع اقلام — هر ردیف جدا گرد می‌شود (مثل ذخیرهٔ total هر قلم) */
export function itemsSubtotal(items: PricedItem[]): number {
  return items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
}

/** مبلغ نهایی فاکتور = جمع اقلام − تخفیف (هرگز منفی نمی‌شود) */
export function invoiceTotal(subtotal: number, discount: number): number {
  return Math.max(0, subtotal - Math.max(0, discount))
}

/**
 * تقسیم پرداخت فاکتور:
 *  credit (نسیه/مانده) = total − نقدی − چک‌ها − تسویه‌های بعدی  (حداقل صفر)
 *  excess (مازاد → علی‌الحساب شخص) = نقدی + چک‌ها − total      (حداقل صفر)
 * تسویه‌های بعدی فقط مانده را کم می‌کنند و مازاد نمی‌سازند.
 */
export function paymentSplit(input: {
  total: number
  paidCash: number
  paidChecks: number
  settled?: number
}): { credit: number; excess: number; status: "OPEN" | "SETTLED" } {
  const { total, paidCash, paidChecks, settled = 0 } = input
  const credit = Math.max(0, total - paidCash - paidChecks - settled)
  const excess = Math.max(0, paidCash + paidChecks - total)
  return { credit, excess, status: credit <= 0 ? "SETTLED" : "OPEN" }
}

/** سود ناخالص اقلام فروش = Σ(فی فروش − قیمت تمام‌شده) × تعداد */
export function itemsGrossProfit(items: CostedItem[]): number {
  return items.reduce((s, i) => s + (i.unitPrice - (i.costPrice || 0)) * i.quantity, 0)
}

/**
 * سود یک فاکتور فروش = سود اقلام − تخفیف (گرد شده).
 * فاکتور خرید سود ندارد (صفر).
 */
export function invoiceProfit(inv: { type: string; discount?: number | null; items: CostedItem[] }): number {
  if (inv.type !== "SALE") return 0
  return Math.round(itemsGrossProfit(inv.items)) - (inv.discount ?? 0)
}

/** حاشیهٔ سود به درصد (روی فروش)؛ فروش صفر → صفر */
export function profitMargin(profit: number, sales: number): number {
  if (!sales) return 0
  return (profit / sales) * 100
}

/**
 * تراز شخص: مثبت = طلب ما (شخص بدهکار است) • منفی = بدهی ما
 *   مانده اولیه + نسیهٔ فاکتورهای فروش − نسیهٔ فاکتورهای خرید
 *   − دریافت‌های آزاد + پرداخت‌های آزاد
 * (تسویه‌های متصل به فاکتور داخل credit فاکتور لحاظ شده‌اند و اینجا نمی‌آیند)
 */
export function personBalance(input: {
  openingBalance?: number
  saleCredit: number
  purchaseCredit: number
  freeReceives: number
  freePays: number
}): number {
  return (
    (input.openingBalance ?? 0) +
    input.saleCredit -
    input.purchaseCredit -
    input.freeReceives +
    input.freePays
  )
}

/**
 * میانگین موزون قیمت تمام‌شده:
 *   (موجودی اولیه × قیمت اولیه + Σ خریدها) ÷ (موجودی اولیه + Σ تعداد خرید)
 * بدون موجودی و خرید → صفر.
 */
export function weightedAverageCost(
  initial: { quantity: number; unitCost: number },
  purchases: PricedItem[]
): number {
  const purchasedQty = purchases.reduce((s, i) => s + i.quantity, 0)
  const purchasedCost = purchases.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalQty = (initial.quantity || 0) + purchasedQty
  if (totalQty <= 0) return 0
  return Math.round(((initial.quantity || 0) * (initial.unitCost || 0) + purchasedCost) / totalQty)
}

/** موجودی کالا = اولیه + خریدها − فروش‌ها */
export function stockLevel(initial: number, purchasedQty: number, soldQty: number): number {
  return (initial || 0) + purchasedQty - soldQty
}

/** تراز حساب بانکی = مانده اولیه + واریزها − برداشت‌ها */
export function accountBalance(initial: number, ins: number, outs: number): number {
  return initial + ins - outs
}

/** درصد تغییر نسبت به دورهٔ قبل (null یعنی دورهٔ قبل صفر بوده) */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * وصول فروش یک بازه — از مبلغ فاکتورهای فروش چقدر:
 *   نقد همان لحظه • چک همان لحظه • بعداً تسویه شده • هنوز نسیه مانده
 * (مازاد پرداخت جزو وصول همین فاکتورها حساب نمی‌شود؛ هر بخش تا سقف مبلغ فاکتور)
 */
export function collectionBreakdown(
  invoices: { total: number; paidCash: number; paidChecks: number; credit: number }[]
): { total: number; cash: number; checks: number; settledLater: number; open: number } {
  const r = { total: 0, cash: 0, checks: 0, settledLater: 0, open: 0 }
  for (const inv of invoices) {
    const cash = Math.min(inv.paidCash, inv.total)
    const checks = Math.min(inv.paidChecks, inv.total - cash)
    const open = Math.min(Math.max(0, inv.credit), inv.total - cash - checks)
    r.total += inv.total
    r.cash += cash
    r.checks += checks
    r.open += open
    r.settledLater += inv.total - cash - checks - open
  }
  return r
}
