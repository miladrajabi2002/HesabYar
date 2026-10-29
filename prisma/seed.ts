/**
 * داده‌های نمونه فروشگاه الکترود — prisma/seed.ts
 * اجرا: bun run seed
 * تاریخ‌ها نسبت به «امروز» محاسبه می‌شوند تا داشبورد همیشه زنده باشد.
 */
import { PrismaClient } from "@prisma/client"
import { jalaliToInstant, nowTehran, startOfJalaliDay } from "../src/lib/jalali"

const db = new PrismaClient()

/** n روز قبل (ظهر تهران) */
function d(n: number): Date {
  const base = startOfJalaliDay(nowTehran())
  return new Date(base.getTime() - n * 86_400_000 + 12 * 3_600_000)
}

/** n روز بعد */
function future(n: number): Date {
  return d(-n)
}

async function main() {
  console.log("🧹 پاک‌سازی داده‌های قبلی...")
  await db.notificationLog.deleteMany()
  await db.transaction.deleteMany()
  await db.checkPaper.deleteMany()
  await db.settlement.deleteMany()
  await db.invoiceItem.deleteMany()
  await db.invoice.deleteMany()
  await db.product.deleteMany()
  await db.person.deleteMany()
  await db.account.deleteMany()
  await db.setting.deleteMany()

  // ───────── تنظیمات ─────────
  await db.setting.create({
    data: {
      id: "default",
      botToken: process.env.BOT_TOKEN?.trim() || null,
      adminChatId: process.env.ADMIN_CHAT_ID?.trim() || null,
      miniAppUrl: process.env.MINI_APP_URL?.trim() || null,
      checkDueDaysBefore: 3,
    },
  })

  // ───────── حساب‌های بانکی ─────────
  const mellat = await db.account.create({
    data: { name: "جاری ملت", bankKey: "mellat", accountNumber: "1234567890", initialBalance: 80_000_000 },
  })
  const melli = await db.account.create({
    data: { name: "جاری ملی", bankKey: "bmi", accountNumber: "0123456789012", initialBalance: 200_000_000 },
  })
  const saderat = await db.account.create({
    data: { name: "کوتاه‌مدت صادرات", bankKey: "bsi", accountNumber: "9876543210", initialBalance: 0 },
  })

  // ───────── اشخاص ─────────
  const supEsfahan = await db.person.create({
    data: {
      name: "شرکت الکترودسازی اصفهان",
      phone: "03133456789",
      company: "الکترودسازی اصفهان",
      shopAddress: "اصفهان، خیابان صنعتی، شهرک صنعتی محمودآباد",
      role: "SUPPLIER",
    },
  })
  const supAria = await db.person.create({
    data: {
      name: "پخش آریا جوش",
      phone: "02155667788",
      company: "آریا جوش",
      shopAddress: "تهران، خیابان امیرکبیر، پاساژ ابزار، پلاک ۱۲",
      role: "SUPPLIER",
    },
  })
  const supTehranPakhsh = await db.person.create({
    data: {
      name: "تهران‌پخش مواد جوشکاری",
      phone: "02188990011",
      company: "تهران‌پخش",
      role: "SUPPLIER",
    },
  })
  const cRahimi = await db.person.create({
    data: { name: "آهنگری رحیمی", phone: "09121112233", role: "CUSTOMER", shopAddress: "بازار آهن، پلاک ۴۵" },
  })
  const cGhalandari = await db.person.create({
    data: { name: "کارگاه فنی قلندری", phone: "09124445566", company: "فنی قلندری", role: "CUSTOMER" },
  })
  const cKhorshid = await db.person.create({
    data: { name: "تعمیرگاه کامیانت خورشید", phone: "09127778899", role: "CUSTOMER" },
  })
  const cMorteza = await db.person.create({
    data: { name: "استادکار مرتضی", phone: "09123334455", role: "CUSTOMER" },
  })
  const cNemati = await db.person.create({
    data: { name: "جوشکاری نعمتی", phone: "09126667788", role: "CUSTOMER" },
  })

  // ───────── اجناس ─────────
  const mkProduct = (name: string, brand: string, code: string, unit: string, minStock: number) =>
    db.product.create({ data: { name, brand, code, unit, minStock } })
  const e6013_25 = await mkProduct("الکترود E6013 قطر ۲.۵", "اصفهان", "E60-25", "بسته", 30)
  const e6013_32 = await mkProduct("الکترود E6013 قطر ۳.۲", "اصفهان", "E60-32", "بسته", 30)
  const e6013_40 = await mkProduct("الکترود E6013 قطر ۴", "اصفهان", "E60-40", "بسته", 20)
  const e7018_25 = await mkProduct("الکترود E7018 قطر ۲.۵", "آریا", "E70-25", "بسته", 25)
  const e7018_32 = await mkProduct("الکترود E7018 قطر ۳.۲", "آریا", "E70-32", "بسته", 25)
  const e7018_40 = await mkProduct("الکترود E7018 قطر ۴", "آریا", "E70-40", "بسته", 20)
  const migWire = await mkProduct("سیم جوش MIG ER70S-6 (۱۵ کیلو)", "شهرک صنعتی", "MIG-15", "عدد", 5)
  const co2Wire = await mkProduct("مفتول جوش CO2 (۱۵ کیلو)", "نیروسیم", "CO2-15", "عدد", 5)

  let invoiceNo = 1000
  interface ItemSpec {
    productId: string
    quantity: number
    unitPrice: number
    costPrice: number
  }
  interface CheckSpec {
    amount: number
    bankKey: string
    serial: string
    dueInDays: number
  }

  /** ساخت فاکتور + اقلام + تراکنش نقدی + چک‌ها */
  async function makeInvoice(opts: {
    type: "PURCHASE" | "SALE"
    personId: string
    date: Date
    items: ItemSpec[]
    paidCash?: number
    accountId?: string
    checks?: CheckSpec[]
    note?: string
  }) {
    invoiceNo++
    const subtotal = opts.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
    const paidCash = opts.paidCash ?? 0
    const checkTotal = (opts.checks ?? []).reduce((s, c) => s + c.amount, 0)
    const credit = subtotal - paidCash - checkTotal
    const invoice = await db.invoice.create({
      data: {
        number: invoiceNo,
        type: opts.type,
        personId: opts.personId,
        accountId: opts.accountId ?? null,
        date: opts.date,
        subtotal,
        total: subtotal,
        paidCash,
        paidChecks: checkTotal,
        credit,
        status: credit <= 0 ? "SETTLED" : "OPEN",
        note: opts.note ?? null,
      },
    })
    for (const it of opts.items) {
      const product = await db.product.findUniqueOrThrow({ where: { id: it.productId } })
      await db.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: it.productId,
          productName: product.name,
          brand: product.brand,
          code: product.code,
          unit: product.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          costPrice: opts.type === "SALE" ? it.costPrice : 0,
          total: Math.round(it.quantity * it.unitPrice),
        },
      })
    }
    if (paidCash > 0 && opts.accountId) {
      await db.transaction.create({
        data: {
          accountId: opts.accountId,
          direction: opts.type === "SALE" ? "IN" : "OUT",
          amount: paidCash,
          type: "INVOICE_CASH",
          refId: invoice.id,
          description: `${opts.type === "SALE" ? "فروش" : "خرید"} نقدی — فاکتور ${invoiceNo}`,
          date: opts.date,
        },
      })
    }
    for (const c of opts.checks ?? []) {
      await db.checkPaper.create({
        data: {
          serial: c.serial,
          amount: c.amount,
          bankKey: c.bankKey,
          direction: opts.type === "SALE" ? "RECEIVED" : "ISSUED",
          dueDate: future(c.dueInDays),
          personId: opts.personId,
          invoiceId: invoice.id,
          note: `بابت فاکتور ${invoiceNo}`,
        },
      })
    }
    return invoice
  }

  console.log("📦 ثبت فاکتورهای خرید...")
  // خرید ۱ — الکترود اصفهان (۳۵ روز قبل)
  await makeInvoice({
    type: "PURCHASE",
    personId: supEsfahan.id,
    date: d(35),
    items: [
      { productId: e6013_25.id, quantity: 120, unitPrice: 480_000, costPrice: 0 },
      { productId: e6013_32.id, quantity: 80, unitPrice: 470_000, costPrice: 0 },
      { productId: e6013_40.id, quantity: 60, unitPrice: 455_000, costPrice: 0 },
    ],
    paidCash: 60_000_000,
    accountId: mellat.id,
    checks: [{ amount: 40_000_000, bankKey: "saman", serial: "884512", dueInDays: 25 }],
    note: "خرید عمده الکترود E6013",
  })
  // خرید ۲ — آریا جوش (۳۰ روز قبل)
  await makeInvoice({
    type: "PURCHASE",
    personId: supAria.id,
    date: d(30),
    items: [
      { productId: e7018_25.id, quantity: 60, unitPrice: 620_000, costPrice: 0 },
      { productId: e7018_32.id, quantity: 50, unitPrice: 600_000, costPrice: 0 },
      { productId: e7018_40.id, quantity: 30, unitPrice: 585_000, costPrice: 0 },
    ],
    paidCash: 20_000_000,
    accountId: melli.id,
    checks: [{ amount: 50_000_000, bankKey: "mellat", serial: "772123", dueInDays: 12 }],
  })
  // خرید ۳ — تهران‌پخش (۱۲ روز قبل)
  await makeInvoice({
    type: "PURCHASE",
    personId: supTehranPakhsh.id,
    date: d(12),
    items: [
      { productId: migWire.id, quantity: 20, unitPrice: 3_200_000, costPrice: 0 },
      { productId: co2Wire.id, quantity: 15, unitPrice: 2_850_000, costPrice: 0 },
    ],
    paidCash: 106_750_000,
    accountId: melli.id,
  })

  console.log("💰 ثبت فاکتورهای فروش...")
  // فروش ۱ — رحیمی (۲۸ روز قبل): نقدی + چک + نسیه
  await makeInvoice({
    type: "SALE",
    personId: cRahimi.id,
    date: d(28),
    items: [
      { productId: e6013_25.id, quantity: 40, unitPrice: 545_000, costPrice: 480_000 },
      { productId: e6013_32.id, quantity: 30, unitPrice: 535_000, costPrice: 470_000 },
    ],
    paidCash: 20_000_000,
    accountId: mellat.id,
    checks: [{ amount: 10_000_000, bankKey: "mellat", serial: "553891", dueInDays: 18 }],
  })
  // فروش ۲ — قلندری (۲۵ روز قبل): نقدی کامل
  await makeInvoice({
    type: "SALE",
    personId: cGhalandari.id,
    date: d(25),
    items: [
      { productId: e7018_32.id, quantity: 25, unitPrice: 680_000, costPrice: 600_000 },
      { productId: e7018_40.id, quantity: 20, unitPrice: 660_000, costPrice: 585_000 },
    ],
    paidCash: 30_200_000,
    accountId: mellat.id,
  })
  // فروش ۳ — خورشید (۲۱ روز قبل): چک + نسیه
  await makeInvoice({
    type: "SALE",
    personId: cKhorshid.id,
    date: d(21),
    items: [{ productId: migWire.id, quantity: 8, unitPrice: 3_650_000, costPrice: 3_200_000 }],
    checks: [{ amount: 20_000_000, bankKey: "mellat", serial: "621204", dueInDays: 9 }],
  })
  // فروش ۴ — مرتضی (۱۴ روز قبل): نقدی کامل
  await makeInvoice({
    type: "SALE",
    personId: cMorteza.id,
    date: d(14),
    items: [
      { productId: e6013_25.id, quantity: 15, unitPrice: 545_000, costPrice: 480_000 },
      { productId: e6013_40.id, quantity: 10, unitPrice: 520_000, costPrice: 455_000 },
    ],
    paidCash: 13_375_000,
    accountId: mellat.id,
  })
  // فروش ۵ — نعمتی (۹ روز قبل): کامل نسیه
  const nematiInvoice = await makeInvoice({
    type: "SALE",
    personId: cNemati.id,
    date: d(9),
    items: [
      { productId: e7018_25.id, quantity: 12, unitPrice: 695_000, costPrice: 620_000 },
      { productId: e7018_40.id, quantity: 8, unitPrice: 660_000, costPrice: 585_000 },
    ],
  })
  // فروش ۶ — رحیمی (۳ روز قبل): همه با چک
  await makeInvoice({
    type: "SALE",
    personId: cRahimi.id,
    date: d(3),
    items: [{ productId: co2Wire.id, quantity: 5, unitPrice: 3_150_000, costPrice: 2_850_000 }],
    checks: [{ amount: 15_750_000, bankKey: "bsi", serial: "909233", dueInDays: 16 }],
  })
  // فروش ۷ — خورشید (دیروز): نقدی + نسیه
  await makeInvoice({
    type: "SALE",
    personId: cKhorshid.id,
    date: d(1),
    items: [
      { productId: e6013_32.id, quantity: 10, unitPrice: 535_000, costPrice: 470_000 },
      { productId: e7018_32.id, quantity: 5, unitPrice: 680_000, costPrice: 600_000 },
    ],
    paidCash: 5_000_000,
    accountId: mellat.id,
  })

  console.log("🤝 ثبت تسویه‌ها...")
  // نعمتی بخشی از نسیه را نقدی داد (۵ روز قبل) — بابت همان فاکتور
  const s1 = await db.settlement.create({
    data: {
      personId: cNemati.id,
      invoiceId: nematiInvoice.id,
      direction: "RECEIVE",
      method: "CASH",
      amount: 8_000_000,
      accountId: mellat.id,
      date: d(5),
      note: "بخشی از مانده فاکتور نسیه",
    },
  })
  await db.transaction.create({
    data: {
      accountId: mellat.id,
      direction: "IN",
      amount: 8_000_000,
      type: "SETTLEMENT_CASH",
      refId: s1.id,
      description: "دریافت نقدی از جوشکاری نعمتی",
      date: s1.date,
    },
  })
  // کاهش مانده همان فاکتور پس از تسویه
  await db.invoice.update({
    where: { id: nematiInvoice.id },
    data: { credit: { decrement: 8_000_000 } },
  })
  // پرداخت نقدی به آریا جوش (۸ روز قبل) — آزاد (نقدی بابت حساب)
  const s2 = await db.settlement.create({
    data: {
      personId: supAria.id,
      direction: "PAY",
      method: "CASH",
      amount: 20_000_000,
      accountId: melli.id,
      date: d(8),
      note: "بخشی از بدهی خرید",
    },
  })
  await db.transaction.create({
    data: {
      accountId: melli.id,
      direction: "OUT",
      amount: 20_000_000,
      type: "SETTLEMENT_CASH",
      refId: s2.id,
      description: "پرداخت نقدی به پخش آریا جوش",
      date: s2.date,
    },
  })
  // چک دریافت‌شده بابت طلب قدیمی قلندری (۱۰ روز قبل) — تسویه چکی مستقل
  const s3 = await db.settlement.create({
    data: {
      personId: cGhalandari.id,
      direction: "RECEIVE",
      method: "CHECK",
      amount: 12_000_000,
      date: d(10),
      note: "تسویه طلب قدیمی با چک",
    },
  })
  await db.checkPaper.create({
    data: {
      serial: "553892",
      amount: 12_000_000,
      bankKey: "mellat",
      direction: "RECEIVED",
      dueDate: future(22),
      personId: cGhalandari.id,
      settlementId: s3.id,
      note: "تسویه طلب قدیمی",
    },
  })

  // یک چک وصول‌شده نمونه (وصول ۲ روز قبل)
  const cashedCheck = await db.checkPaper.create({
    data: {
      serial: "621205",
      amount: 20_000_000,
      bankKey: "mellat",
      direction: "RECEIVED",
      dueDate: d(2),
      personId: cKhorshid.id,
      invoiceId: null,
      status: "CASHED",
      accountId: mellat.id,
      note: "چک سابق خورشید — وصول شد",
    },
  })
  await db.transaction.create({
    data: {
      accountId: mellat.id,
      direction: "IN",
      amount: 20_000_000,
      type: "CHECK_CASHED",
      refId: cashedCheck.id,
      description: "وصول چک تعمیرگاه کامیانت خورشید",
      date: d(2),
    },
  })

  console.log("✅ داده نمونه فروشگاه الکترود ثبت شد.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
