/**
 * تست فرمول‌های مالی — tests/finance.test.ts
 * اجرا: npm test
 * همهٔ اعداد به تومان؛ فرمول‌ها در src/lib/finance-math.ts (بدون دیتابیس)
 */
import test from "node:test"
import assert from "node:assert/strict"

import {
  accountBalance,
  changePercent,
  invoiceProfit,
  invoiceTotal,
  itemsGrossProfit,
  itemsSubtotal,
  paymentSplit,
  personBalance,
  profitMargin,
  stockLevel,
  weightedAverageCost,
} from "../src/lib/finance-math"
import { formatChange, formatTomanCompact, parseAmountInput } from "../src/lib/money"

// ───────── جمع و مبلغ نهایی ─────────

test("جمع اقلام: هر ردیف جدا گرد می‌شود", () => {
  assert.equal(
    itemsSubtotal([
      { quantity: 2.5, unitPrice: 101 }, // 252.5 → 253
      { quantity: 3, unitPrice: 1000 },
    ]),
    3253
  )
})

test("جمع اقلام خالی صفر است", () => {
  assert.equal(itemsSubtotal([]), 0)
})

test("مبلغ نهایی = جمع − تخفیف", () => {
  assert.equal(invoiceTotal(1_000_000, 150_000), 850_000)
})

test("تخفیف بیشتر از جمع → مبلغ نهایی صفر (نه منفی)", () => {
  assert.equal(invoiceTotal(100, 500), 0)
})

test("تخفیف منفی نادیده گرفته می‌شود", () => {
  assert.equal(invoiceTotal(1000, -200), 1000)
})

// ───────── تقسیم پرداخت ─────────

test("پرداخت کامل نقدی → تسویه، بدون مانده و مازاد", () => {
  assert.deepEqual(paymentSplit({ total: 500, paidCash: 500, paidChecks: 0 }), {
    credit: 0,
    excess: 0,
    status: "SETTLED",
  })
})

test("نقد + چک کمتر از مبلغ → نسیه باز", () => {
  assert.deepEqual(paymentSplit({ total: 1000, paidCash: 300, paidChecks: 400 }), {
    credit: 300,
    excess: 0,
    status: "OPEN",
  })
})

test("پرداخت بیشتر از مبلغ → مازاد علی‌الحساب", () => {
  const r = paymentSplit({ total: 1000, paidCash: 700, paidChecks: 500 })
  assert.equal(r.credit, 0)
  assert.equal(r.excess, 200)
  assert.equal(r.status, "SETTLED")
})

test("تسویهٔ بعدی مانده را کم می‌کند ولی مازاد نمی‌سازد", () => {
  const r = paymentSplit({ total: 1000, paidCash: 200, paidChecks: 0, settled: 1200 })
  assert.equal(r.credit, 0)
  assert.equal(r.excess, 0)
  assert.equal(r.status, "SETTLED")
})

test("فاکتور صفر تومانی تسویه‌شده است", () => {
  assert.equal(paymentSplit({ total: 0, paidCash: 0, paidChecks: 0 }).status, "SETTLED")
})

test("نقدی + چک + نسیه همیشه برابر مبلغ فاکتور است (بدون مازاد)", () => {
  for (const [total, cash, checks] of [
    [1_000_000, 0, 0],
    [1_000_000, 250_000, 500_000],
    [7_777_777, 1, 7_777_775],
  ]) {
    const { credit, excess } = paymentSplit({ total, paidCash: cash, paidChecks: checks })
    assert.equal(excess, 0)
    assert.equal(cash + checks + credit, total)
  }
})

// ───────── سود ─────────

test("سود اقلام = (فروش − تمام‌شده) × تعداد", () => {
  assert.equal(
    itemsGrossProfit([
      { quantity: 10, unitPrice: 1200, costPrice: 1000 },
      { quantity: 2, unitPrice: 500, costPrice: 600 }, // ضرر
    ]),
    2000 - 200
  )
})

test("قیمت تمام‌شدهٔ خالی صفر حساب می‌شود", () => {
  assert.equal(itemsGrossProfit([{ quantity: 1, unitPrice: 900, costPrice: 0 }]), 900)
})

test("سود فاکتور فروش، تخفیف را کم می‌کند", () => {
  assert.equal(
    invoiceProfit({
      type: "SALE",
      discount: 300,
      items: [{ quantity: 4, unitPrice: 1000, costPrice: 800 }],
    }),
    800 - 300
  )
})

test("تخفیف بیشتر از سود → سود منفی (ضرر) گزارش می‌شود", () => {
  assert.equal(
    invoiceProfit({ type: "SALE", discount: 1000, items: [{ quantity: 1, unitPrice: 1100, costPrice: 1000 }] }),
    -900
  )
})

test("فاکتور خرید سود ندارد", () => {
  assert.equal(
    invoiceProfit({ type: "PURCHASE", discount: 50, items: [{ quantity: 1, unitPrice: 999, costPrice: 0 }] }),
    0
  )
})

test("سود اعشاری گرد می‌شود", () => {
  assert.equal(
    invoiceProfit({ type: "SALE", items: [{ quantity: 1.5, unitPrice: 1001, costPrice: 1000 }] }),
    2 // 1.5 → 2
  )
})

test("حاشیه سود درصدی و فروش صفر", () => {
  assert.equal(profitMargin(250, 1000), 25)
  assert.equal(profitMargin(100, 0), 0)
})

// ───────── تراز شخص ─────────

test("تراز شخص: فروش نسیه = طلب ما (مثبت)", () => {
  assert.equal(personBalance({ saleCredit: 500, purchaseCredit: 0, freeReceives: 0, freePays: 0 }), 500)
})

test("تراز شخص: خرید نسیه = بدهی ما (منفی)", () => {
  assert.equal(personBalance({ saleCredit: 0, purchaseCredit: 800, freeReceives: 0, freePays: 0 }), -800)
})

test("تراز شخص: دریافت آزاد طلب را کم و پرداخت آزاد بدهی را کم می‌کند", () => {
  assert.equal(
    personBalance({ openingBalance: 100, saleCredit: 1000, purchaseCredit: 300, freeReceives: 400, freePays: 50 }),
    100 + 1000 - 300 - 400 + 50
  )
})

test("تراز شخص: مانده اولیه منفی (بدهی قبلی ما)", () => {
  assert.equal(
    personBalance({ openingBalance: -2000, saleCredit: 0, purchaseCredit: 0, freeReceives: 0, freePays: 2000 }),
    0
  )
})

// ───────── میانگین قیمت تمام‌شده و موجودی ─────────

test("میانگین موزون: موجودی اولیه + دو خرید", () => {
  // ۱۰×۱۰۰ + ۱۰×۲۰۰ + ۲۰×۳۰۰ = ۹۰۰۰ ÷ ۴۰ = ۲۲۵
  assert.equal(
    weightedAverageCost({ quantity: 10, unitCost: 100 }, [
      { quantity: 10, unitPrice: 200 },
      { quantity: 20, unitPrice: 300 },
    ]),
    225
  )
})

test("میانگین موزون بدون موجودی و خرید → صفر", () => {
  assert.equal(weightedAverageCost({ quantity: 0, unitCost: 500 }, []), 0)
})

test("میانگین موزون فقط از موجودی اولیه (فروش از موجودی قبل از برنامه، سود ۱۰۰٪ نمی‌شود)", () => {
  assert.equal(weightedAverageCost({ quantity: 5, unitCost: 700 }, []), 700)
})

test("میانگین موزون گرد می‌شود", () => {
  assert.equal(weightedAverageCost({ quantity: 0, unitCost: 0 }, [
    { quantity: 1, unitPrice: 100 },
    { quantity: 2, unitPrice: 101 },
  ]), 101) // 302/3 = 100.67
})

test("موجودی = اولیه + خرید − فروش (منفی هم مجاز برای هشدار)", () => {
  assert.equal(stockLevel(5, 10, 3), 12)
  assert.equal(stockLevel(0, 1, 4), -3)
})

// ───────── حساب بانکی و درصد تغییر ─────────

test("تراز حساب = اولیه + واریز − برداشت", () => {
  assert.equal(accountBalance(1_000, 5_000, 2_500), 3_500)
})

test("درصد تغییر", () => {
  assert.equal(changePercent(150, 100), 50)
  assert.equal(changePercent(50, 100), -50)
  assert.equal(changePercent(10, 0), null)
  assert.equal(changePercent(-50, -100), 50)
})

// ───────── قالب‌بندی مبالغ ─────────

test("formatChange: جهت و متن", () => {
  assert.deepEqual(formatChange(120, 100), { text: "+۲۰٪", direction: "up" })
  assert.equal(formatChange(80, 100).direction, "down")
  assert.equal(formatChange(100, 100).direction, "flat")
  assert.equal(formatChange(5, 0).text, "جدید")
})

test("formatTomanCompact: میلیون و میلیارد", () => {
  assert.equal(formatTomanCompact(2_500_000), "۲٫۵ میلیون تومان")
  assert.equal(formatTomanCompact(1_200_000_000), "۱٫۲ میلیارد تومان")
  assert.equal(formatTomanCompact(-3_000_000), "−۳ میلیون تومان")
})

test("parseAmountInput: ارقام فارسی و جداکننده", () => {
  assert.equal(parseAmountInput("۱٬۲۵۰٬۰۰۰"), 1_250_000)
  assert.equal(parseAmountInput("abc"), 0)
  assert.equal(parseAmountInput("-500"), 500)
})

// ───────── صورتحساب شخص (دفتر بدهکار/بستانکار) ─────────
import { buildStatement } from "../src/lib/statement"

const d = (day: number) => new Date(Date.UTC(2025, 0, day, 9))

test("صورتحساب: ماندهٔ پایانی برابر تراز شخص است", () => {
  const st = buildStatement({
    openingBalance: 100,
    openingDate: d(1),
    invoices: [
      { id: "a", number: 1001, type: "SALE", date: d(2), total: 1000, paidCash: 300, paidChecks: 200, itemCount: 2 },
      { id: "b", number: 1002, type: "PURCHASE", date: d(3), total: 400, paidCash: 0, paidChecks: 0, itemCount: 1 },
    ],
    settlements: [{ id: "s", direction: "RECEIVE", method: "CASH", amount: 150, date: d(4) }],
  })
  // تراز = ۱۰۰ + نسیه فروش (۵۰۰) − نسیه خرید (۴۰۰) − دریافت آزاد (۱۵۰)
  assert.equal(
    st.closing,
    personBalance({ openingBalance: 100, saleCredit: 500, purchaseCredit: 400, freeReceives: 150, freePays: 0 })
  )
  assert.equal(st.closing, 50)
  assert.equal(st.rows.length, 5) // اولیه، فاکتور، دریافت، فاکتور خرید، تسویه
})

test("صورتحساب: پرداخت مازاد دوبار شمرده نمی‌شود (سقف = مبلغ فاکتور)", () => {
  // نقد ۱۲۰۰ برای فاکتور ۱۰۰۰ → مازاد ۲۰۰ به‌صورت تسویهٔ آزاد ثبت شده
  const st = buildStatement({
    openingBalance: 0,
    openingDate: d(1),
    invoices: [{ id: "a", number: 1, type: "SALE", date: d(2), total: 1000, paidCash: 1200, paidChecks: 0, itemCount: 1 }],
    settlements: [{ id: "x", direction: "RECEIVE", method: "CASH", amount: 200, date: d(2) }],
  })
  assert.equal(st.closing, -200) // ما ۲۰۰ بدهکاریم (علی‌الحساب شخص)
})

test("صورتحساب: بازهٔ تاریخ — ردیف‌های قبلی در «مانده از قبل» جمع می‌شوند", () => {
  const st = buildStatement({
    openingBalance: 0,
    openingDate: d(1),
    from: d(10),
    invoices: [
      { id: "a", number: 1, type: "SALE", date: d(2), total: 700, paidCash: 0, paidChecks: 0, itemCount: 1 },
      { id: "b", number: 2, type: "SALE", date: d(12), total: 300, paidCash: 0, paidChecks: 0, itemCount: 1 },
    ],
    settlements: [],
  })
  assert.equal(st.rows[0].kind, "carry")
  assert.equal(st.rows[0].balance, 700)
  assert.equal(st.totalDebit, 300) // فقط گردش داخل بازه
  assert.equal(st.closing, 1000)
})

test("صورتحساب: فاکتور خرید با پرداخت کامل ما → تسویه", () => {
  const st = buildStatement({
    openingBalance: 0,
    openingDate: d(1),
    invoices: [{ id: "a", number: 9, type: "PURCHASE", date: d(5), total: 500, paidCash: 200, paidChecks: 300, itemCount: 3 }],
    settlements: [],
  })
  assert.equal(st.closing, 0)
  assert.equal(st.totalDebit, 500)
  assert.equal(st.totalCredit, 500)
})

// ───────── وصول فروش ─────────
import { collectionBreakdown } from "../src/lib/finance-math"

test("وصول فروش: نقد + چک + تسویهٔ بعدی + نسیه = جمع فروش", () => {
  const r = collectionBreakdown([
    { total: 1000, paidCash: 1000, paidChecks: 0, credit: 0 }, // نقد کامل
    { total: 800, paidCash: 200, paidChecks: 300, credit: 100 }, // ۲۰۰ بعداً تسویه شده
    { total: 500, paidCash: 0, paidChecks: 0, credit: 500 }, // نسیهٔ کامل
  ])
  assert.deepEqual(r, { total: 2300, cash: 1200, checks: 300, settledLater: 200, open: 600 })
  assert.equal(r.cash + r.checks + r.settledLater + r.open, r.total)
})

test("وصول فروش: پرداخت مازاد از سقف فاکتور بیشتر شمرده نمی‌شود", () => {
  const r = collectionBreakdown([{ total: 1000, paidCash: 900, paidChecks: 400, credit: 0 }])
  assert.equal(r.cash, 900)
  assert.equal(r.checks, 100)
  assert.equal(r.settledLater, 0)
})
