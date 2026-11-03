import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import {
  getAccountBalances,
  getPersonBalances,
  getPersonActivity,
  openBalanceDays,
  periodSummary,
  dailySeries,
  salesCollection,
} from "@/lib/finance"
import {
  nowTehran,
  startOfJalaliDay,
  endOfJalaliDay,
  startOfJalaliMonth,
  endOfJalaliMonth,
  addJalaliMonths,
  diffJalaliDays,
} from "@/lib/jalali"

export const dynamic = "force-dynamic"

/** GET /api/dashboard — همه چیز برای داشبورد فروشگاه */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const now = nowTehran()
    const [dayStart, dayEnd] = [startOfJalaliDay(now), endOfJalaliDay(now)]
    const [monthStart, monthEnd] = [startOfJalaliMonth(now), endOfJalaliMonth(now)]
    // ST-01: ماه قبل برای مقایسه دوره‌ای KPIها
    const prevMonthStart = startOfJalaliMonth(addJalaliMonths(now, -1))
    const prevMonthEnd = endOfJalaliMonth(addJalaliMonths(now, -1))
    // هفته: از ابتدای شنبه این هفته
    const wall = new Date(now.getTime() + 3.5 * 3600_000)
    const gteDay = wall.getUTCDay() // 0=یکشنبه میلادی → شنبه‌محور
    const saturdayOffset = (gteDay + 1) % 7
    const weekStart = new Date(startOfJalaliDay(now).getTime() - saturdayOffset * 86_400_000)

    // مقایسهٔ منصفانه: بازهٔ جاری تا امروز در برابر همان تعداد روز از دورهٔ قبل
    // (فاکتور ساعت ندارد، پس مقایسه روزبه‌روز است نه ساعت‌به‌ساعت)
    const DAY = 86_400_000
    const yesterday = new Date(now.getTime() - DAY)
    const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY)
    const prevWeekEnd = new Date(dayEnd.getTime() - 7 * DAY)
    // همان روز ماه قبل (اگر ماه قبل کوتاه‌تر بود، آخرین روزش)
    const prevMonthToDateEnd = endOfJalaliDay(addJalaliMonths(now, -1))

    const [today, week, month, prevMonth, yesterdaySum, prevWeek, monthToDate, prevMonthToDate, accounts, personBalances, monthCollection, activity] =
      await Promise.all([
        periodSummary(dayStart, dayEnd),
        periodSummary(weekStart, dayEnd),
        periodSummary(monthStart, monthEnd),
        periodSummary(prevMonthStart, prevMonthEnd),
        periodSummary(startOfJalaliDay(yesterday), endOfJalaliDay(yesterday)),
        periodSummary(prevWeekStart, prevWeekEnd),
        periodSummary(monthStart, dayEnd),
        periodSummary(prevMonthStart, prevMonthToDateEnd),
        getAccountBalances(),
        getPersonBalances(),
        salesCollection(monthStart, monthEnd),
        getPersonActivity(),
      ])

    // ST-01: درصد تغییر نسبت به دورهٔ قبل (null = دورهٔ قبل صفر بوده)
    const pct = (cur: number, prev: number): number | null => {
      if (prev === 0) return cur === 0 ? 0 : null
      return Math.round(((cur - prev) / Math.abs(prev)) * 100)
    }
    const compare = (cur: typeof today, prev: typeof today) => ({
      sales: pct(cur.sales, prev.sales),
      purchases: pct(cur.purchases, prev.purchases),
      profit: pct(cur.profit, prev.profit),
      saleCount: pct(cur.saleCount, prev.saleCount),
    })
    // ماه: «از اول ماه تا امروز» در برابر «از اول ماه قبل تا همین روز»
    const monthComparison = compare(monthToDate, prevMonthToDate)
    const comparison = {
      day: compare(today, yesterdaySum),
      week: compare(week, prevWeek),
      month: monthComparison,
    }

    // طلبکاران و بستانکاران (۱۵ نفر اول هر کدام)
    const people = await db.person.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, phone: true, company: true, role: true },
    })
    const withBalance = people
      .map((p) => {
        const balance = personBalances.get(p.id) ?? 0
        return { ...p, balance, openDays: openBalanceDays(balance, activity.get(p.id), now) }
      })
      .filter((p) => p.balance !== 0)
    const debtors = withBalance
      .filter((p) => p.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 15)
    const creditors = withBalance
      .filter((p) => p.balance < 0)
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 15)
    const totalReceivable = withBalance.reduce((s, p) => s + Math.max(0, p.balance), 0)
    const totalPayable = -withBalance.reduce((s, p) => s + Math.min(0, p.balance), 0)

    // چک‌های در جریان نزدیک سررسید
    const pendingChecks = await db.checkPaper.findMany({
      where: { status: "PENDING" },
      include: { person: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 50,
    })
    const checksWithDays = pendingChecks
      .map((c) => ({ ...c, daysLeft: diffJalaliDays(now, c.dueDate) }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
    const upcomingChecks = checksWithDays.slice(0, 8)
    // جمع‌ها از کل چک‌های در جریان (نه فقط ۵۰ تای نمایش‌داده‌شده)
    const pendingTotals = await db.checkPaper.groupBy({
      by: ["direction"],
      where: { status: "PENDING" },
      _sum: { amount: true },
    })
    const pendingReceivedTotal = pendingTotals.find((g) => g.direction === "RECEIVED")?._sum.amount ?? 0
    const pendingIssuedTotal = pendingTotals.find((g) => g.direction === "ISSUED")?._sum.amount ?? 0

    // سری نمودار: از «۳۰ روز اخیر» یا اول ماه (هرکدام زودتر) تا آخر ماه جاری؛
    // کلید ۷ / ۳۰ روز / این ماه سمت کلاینت برش می‌زند
    const last30 = new Date(startOfJalaliDay(now).getTime() - 29 * 86_400_000)
    const monthStartD = startOfJalaliMonth(now)
    const chartStart = last30 < monthStartD ? last30 : monthStartD
    const series = await dailySeries(chartStart, endOfJalaliMonth(now))

    // آخرین فاکتورها
    const recentInvoices = await db.invoice.findMany({
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take: 6,
      include: {
        person: { select: { id: true, name: true, role: true } },
        checks: { select: { id: true, amount: true, bankKey: true, dueDate: true, status: true } },
      },
    })

    return ok({
      today,
      week,
      month,
      prevMonth,
      monthToDate,
      monthComparison,
      comparison,
      accounts,
      totalBankBalance: accounts.reduce((s, a) => s + a.balance, 0),
      debtors,
      creditors,
      totalReceivable,
      totalPayable,
      checks: {
        upcoming: upcomingChecks,
        pendingReceivedTotal,
        pendingIssuedTotal,
      },
      series,
      recentInvoices,
      monthCollection,
    })
  } catch (e) {
    return serverError(e)
  }
}
