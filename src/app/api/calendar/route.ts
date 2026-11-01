import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import {
  monthKeyRange,
  currentMonthKey,
  jalaliDayKey,
  jalaliOf,
  jalaliToInstant,
  jalaliMonthLengthOf,
  weekdayName,
  JALALI_MONTHS,
} from "@/lib/jalali"

export const dynamic = "force-dynamic"

/**
 * GET /api/calendar?month=1404-08 — تقویم مالی ماهانه شمسی (ADV-05)
 * چک‌ها، فاکتورها و تسویه‌ها روی روزهای ماه.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const monthParam = new URL(req.url).searchParams.get("month")?.trim()
    const month = monthParam && /^\d{3,4}-\d{1,2}$/.test(monthParam) ? monthParam : currentMonthKey()
    const { start, end } = monthKeyRange(month)

    const [checks, invoices, settlements] = await Promise.all([
      db.checkPaper.findMany({
        where: { dueDate: { gte: start, lte: end } },
        include: { person: { select: { name: true } } },
      }),
      db.invoice.findMany({
        where: { date: { gte: start, lte: end } },
        include: { person: { select: { name: true } } },
      }),
      db.settlement.findMany({
        where: { date: { gte: start, lte: end } },
        include: { person: { select: { name: true } } },
      }),
    ])

    // گروه‌بندی بر اساس کلید روز شمسی
    const days = new Map<
      string,
      {
        checks: { id: string; amount: number; bankKey: string; direction: string; status: string; serial: string; person: { name: string } }[]
        invoices: { id: string; number: number; type: string; total: number; person: { name: string } }[]
        settlements: { id: string; amount: number; direction: string; method: string; person: { name: string } }[]
      }
    >()
    const push = (day: string, kind: "checks" | "invoices" | "settlements", item: unknown) => {
      const entry = days.get(day) ?? { checks: [], invoices: [], settlements: [] }
      ;(entry[kind] as unknown[]).push(item)
      days.set(day, entry)
    }
    for (const c of checks) push(jalaliDayKey(c.dueDate), "checks", {
      id: c.id, amount: c.amount, bankKey: c.bankKey, direction: c.direction, status: c.status, serial: c.serial,
      person: c.person,
    })
    for (const inv of invoices) push(jalaliDayKey(inv.date), "invoices", {
      id: inv.id, number: inv.number, type: inv.type, total: inv.total, person: inv.person,
    })
    for (const s of settlements) push(jalaliDayKey(s.date), "settlements", {
      id: s.id, amount: s.amount, direction: s.direction, method: s.method, person: s.person,
    })

    // ساخت شبکه ماه: روز اول چه روزی از هفته است؟ (شنبه‌محور)
    const [jy, jm] = month.split("-").map(Number)
    const firstDay = jalaliToInstant(jy, jm, 1, 12)
    const firstWeekday = (() => {
      const t = new Date(firstDay.getTime() + 3.5 * 3600_000)
      return (t.getUTCDay() + 1) % 7 // 0 = شنبه
    })()
    const monthLen = jalaliMonthLengthOf(jy, jm)
    const todayKey = jalaliDayKey(new Date())

    return ok({
      month,
      monthLabel: `${JALALI_MONTHS[jm - 1]} ${jy}`,
      firstWeekday,
      monthLength: monthLen,
      todayKey,
      days: Object.fromEntries(days.entries()),
    })
  } catch (e) {
    return serverError(e)
  }
}
