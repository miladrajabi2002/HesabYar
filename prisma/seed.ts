/**
 * داده نمونه — prisma/seed.ts
 * فقط با دستور «npm run seed» و فقط روی دیتابیس خالی اجرا می‌شود.
 * همه داده‌های نمونه با برچسب «نمونه» مشخص هستند.
 */
import { db } from "@/lib/db"
import { DEFAULT_CATEGORIES } from "@/lib/defaults"
import { jalaliToInstant, jalaliOf, jalaliMonthLengthOf, currentMonthKey, addJalaliMonths, nowTehran } from "@/lib/jalali"

/** مولد شبه‌تصادفی قطعی برای تکرارپذیری داده نمونه */
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

async function main() {
  const [accountCount, txCount] = await Promise.all([db.account.count(), db.transaction.count()])
  if (accountCount > 0 || txCount > 0) {
    console.log("⚠️  دیتابیس خالی نیست. برای امنیت داده واقعی، seed فقط روی دیتابیس خالی اجرا می‌شود.")
    process.exit(0)
  }

  console.log("🌱 در حال ساخت داده نمونه «حساب‌یار»...")

  // دسته‌های پیش‌فرض (فقط اگر از قبل وجود نداشته باشند)
  for (const c of DEFAULT_CATEGORIES) {
    const exists = await db.category.findFirst({ where: { name: c.name, type: c.type } })
    if (!exists) {
      await db.category.create({ data: { ...c, id: `cat-${c.name}` } }).catch(() => null)
    }
  }
  const categories = await db.category.findMany()
  const catByName = new Map(categories.map((c) => [c.name, c]))
  const expenseCats = categories.filter((c) => c.type === "EXPENSE")

  // حساب‌های نمونه
  const cash = await db.account.create({
    data: {
      id: "acc-cash-sample",
      name: "کیف پول نقدی (نمونه)",
      type: "CASH",
      color: "#0E7C66",
      icon: "Wallet",
      initialBalance: 1_500_000,
      sortOrder: 1,
    },
  })
  const bank = await db.account.create({
    data: {
      id: "acc-bank-sample",
      name: "حساب بانکی (نمونه)",
      type: "BANK",
      color: "#8B5CF6",
      icon: "Landmark",
      initialBalance: 18_000_000,
      sortOrder: 2,
    },
  })

  const rand = lcg(1404)

  // تراکنش‌های سه ماه اخیر (شمسی)
  const now = nowTehran()
  let created = 0
  for (let m = -2; m <= 0; m++) {
    const monthDate = addJalaliMonths(now, m)
    const j = jalaliOf(monthDate)
    const monthLen = jalaliMonthLengthOf(j.jy, j.jm)
    const maxDay = m === 0 ? Math.max(1, j.jd - 1) : monthLen

    const txDate = (day: number) => jalaliToInstant(j.jy, j.jm, Math.min(day, maxDay), 12, 0, 0)

    // حقوق ماهانه — روز ۱
    await db.transaction.create({
      data: {
        type: "INCOME",
        amount: 24_500_000,
        accountId: bank.id,
        categoryId: catByName.get("حقوق")?.id,
        date: txDate(1),
        note: "نمونه — حقوق ماهانه",
      },
    })
    created++

    // یک پروژه فریلنس در ماه‌های مختلف
    if (m !== -1) {
      await db.transaction.create({
        data: {
          type: "INCOME",
          amount: 6_800_000,
          accountId: bank.id,
          categoryId: catByName.get("فریلنس")?.id,
          date: txDate(10 + Math.floor(rand() * 10)),
          note: "نمونه — پروژه فریلنس",
        },
      })
      created++
    }

    // هزینه‌های پراکنده ماه
    const expensePlan = [
      { cat: "خوراک", min: 180_000, max: 950_000, count: 6 },
      { cat: "رفت‌وآمد", min: 60_000, max: 320_000, count: 4 },
      { cat: "خرید", min: 350_000, max: 2_400_000, count: 2 },
      { cat: "قبوض", min: 220_000, max: 780_000, count: 2 },
      { cat: "سرگرمی", min: 120_000, max: 600_000, count: 2 },
    ]
    for (const plan of expensePlan) {
      for (let i = 0; i < plan.count; i++) {
        const day = 1 + Math.floor(rand() * maxDay)
        const amount = Math.round((plan.min + rand() * (plan.max - plan.min)) / 1000) * 1000
        const useCash = rand() < 0.35
        await db.transaction.create({
          data: {
            type: "EXPENSE",
            amount,
            accountId: useCash ? cash.id : bank.id,
            categoryId: catByName.get(plan.cat)?.id ?? expenseCats[0].id,
            date: txDate(day),
            note: `نمونه — ${plan.cat}`,
          },
        })
        created++
      }
    }

    // یک انتقال بین حسابی در ماه
    if (m === -1 || m === 0) {
      await db.transaction.create({
        data: {
          type: "TRANSFER",
          amount: 3_000_000,
          accountId: bank.id,
          toAccountId: cash.id,
          date: txDate(5),
          note: "نمونه — برداشت نقدی",
        },
      })
      created++
    }
  }

  // بودجه‌های ماه جاری
  const thisMonth = currentMonthKey()
  const budgetPlan = [
    { cat: "خوراک", amount: 5_000_000 },
    { cat: "خرید", amount: 2_500_000 },
  ]
  for (const b of budgetPlan) {
    const cat = catByName.get(b.cat)
    if (!cat) continue
    await db.budget
      .create({ data: { categoryId: cat.id, amount: b.amount, monthJalali: thisMonth, alertThreshold: 80 } })
      .catch(() => null)
  }

  // قاعده تکرارشونده: اینترنت ماهانه — روز ۵ هر ماه شمسی
  const nj = jalaliOf(addJalaliMonths(now, 1))
  await db.recurringRule.create({
    data: {
      title: "نمونه — اشتراک اینترنت ماهانه",
      type: "EXPENSE",
      amount: 890_000,
      accountId: bank.id,
      categoryId: catByName.get("قبوض")?.id,
      frequency: "MONTHLY_JALALI",
      interval: 1,
      dayOfMonth: 5,
      nextRunAt: jalaliToInstant(nj.jy, nj.jm, 5, 12, 0, 0),
      isActive: true,
    },
  })

  // بدهی و طلب نمونه
  const in10Days = new Date(now.getTime() + 10 * 86_400_000)
  const in25Days = new Date(now.getTime() + 25 * 86_400_000)
  await db.debt.create({
    data: {
      direction: "I_OWE",
      person: "علی رضایی (نمونه)",
      amount: 2_500_000,
      dueDate: in10Days,
      note: "نمونه — قسط وام",
    },
  })
  await db.debt.create({
    data: {
      direction: "OWED_TO_ME",
      person: "سارا محمدی (نمونه)",
      amount: 1_800_000,
      dueDate: in25Days,
      note: "نمونه — قرض داده‌شده",
    },
  })

  console.log(`✅ داده نمونه ساخته شد:
  • ۲ حساب (نقدی و بانکی) با برچسب «نمونه»
  • ${created} تراکنش در ۳ ماه اخیر
  • ۲ بودجه برای ماه جاری (${thisMonth})
  • ۱ قاعده تکرارشونده (اینترنت ماهانه)
  • ۱ بدهی و ۱ طلب با سررسید نزدیک`)
}

main()
  .catch((e) => {
    console.error("خطا در seed:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
