import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, requireApiAuth, serverError } from "@/lib/api-helpers"
import {
  getAccountBalances,
  getPersonBalances,
  periodSummary,
  dailySeries,
} from "@/lib/finance"
import {
  nowTehran,
  startOfJalaliDay,
  endOfJalaliDay,
  startOfJalaliMonth,
  endOfJalaliMonth,
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
    // هفته: از ابتدای شنبه این هفته
    const wall = new Date(now.getTime() + 3.5 * 3600_000)
    const gteDay = wall.getUTCDay() // 0=یکشنبه میلادی → شنبه‌محور
    const saturdayOffset = (gteDay + 1) % 7
    const weekStart = new Date(startOfJalaliDay(now).getTime() - saturdayOffset * 86_400_000)

    const [today, week, month, accounts, personBalances] = await Promise.all([
      periodSummary(dayStart, dayEnd),
      periodSummary(weekStart, dayEnd),
      periodSummary(monthStart, monthEnd),
      getAccountBalances(),
      getPersonBalances(),
    ])

    // طلبکاران و بستانکاران (۱۵ نفر اول هر کدام)
    const people = await db.person.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, phone: true, company: true },
    })
    const withBalance = people
      .map((p) => ({ ...p, balance: personBalances.get(p.id) ?? 0 }))
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
    const pendingReceivedTotal = pendingChecks
      .filter((c) => c.direction === "RECEIVED")
      .reduce((s, c) => s + c.amount, 0)
    const pendingIssuedTotal = pendingChecks
      .filter((c) => c.direction === "ISSUED")
      .reduce((s, c) => s + c.amount, 0)

    // سری ۳۰ روز اخیر برای نمودار
    const chartStart = new Date(startOfJalaliDay(now).getTime() - 29 * 86_400_000)
    const series = await dailySeries(chartStart, dayEnd)

    // آخرین فاکتورها
    const recentInvoices = await db.invoice.findMany({
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take: 6,
      include: {
        person: { select: { id: true, name: true } },
        checks: { select: { id: true, amount: true, bankKey: true, dueDate: true, status: true } },
      },
    })

    return ok({
      today,
      week,
      month,
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
    })
  } catch (e) {
    return serverError(e)
  }
}
