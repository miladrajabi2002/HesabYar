import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { diffJalaliDays, endOfJalaliDay } from "@/lib/jalali"
import { getProductStocks, OVERDUE_DAYS } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** ردیف‌های وضعیت قدیمی‌تر از این پاک می‌شوند (کلیدشان دیگر ساخته نمی‌شود) */
const STATE_TTL_DAYS = 60

export type AlertItem =
  | {
      key: string
      kind: "check"
      unread: boolean
      id: string
      amount: number
      dueDate: Date
      direction: string
      bankKey: string
      serial: string
      personName: string
      isRegistered: boolean
      daysLeft: number
    }
  | {
      key: string
      kind: "sale"
      unread: boolean
      id: string
      number: number
      personName: string
      credit: number
      total: number
      date: Date
      ageDays: number
    }
  | {
      key: string
      kind: "stock"
      unread: boolean
      id: string
      name: string
      unit: string
      stock: number
      minStock: number
    }

/**
 * GET /api/alerts — اعلان‌های زنگ «کار امروز» (هدر و سایدبار)
 *  • چک‌های در جریانی که سررسیدشان امروز یا گذشته است (همان معیار یادآوری صبحگاهی تلگرام)
 *  • فاکتورهای فروش نسیه که بیش از OVERDUE_DAYS روز تسویه نشده‌اند
 *  • کالاهای «رو به اتمام» — موجودی هنوز هست ولی به حد هشدار رسیده؛ کالای ناموجود اعلان ندارد
 * اعلان‌های بسته‌شده (AlertState.dismissedAt) برنمی‌گردند؛ unreadCount = اعلان‌هایی که هنوز دیده نشده‌اند.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const now = new Date()
    const overdueBefore = new Date(now.getTime() - OVERDUE_DAYS * 86_400_000)
    const [checks, sales, products, stocks] = await Promise.all([
      db.checkPaper.findMany({
        where: { status: "PENDING", dueDate: { lte: endOfJalaliDay(now) } },
        orderBy: { dueDate: "asc" },
        take: 30,
        select: {
          id: true,
          amount: true,
          dueDate: true,
          direction: true,
          bankKey: true,
          serial: true,
          isRegistered: true,
          person: { select: { name: true } },
        },
      }),
      db.invoice.findMany({
        where: { credit: { gt: 0 }, date: { lt: overdueBefore }, type: "SALE" },
        orderBy: { date: "asc" },
        take: 30,
        select: { id: true, number: true, credit: true, total: true, date: true, person: { select: { name: true } } },
      }),
      db.product.findMany({
        where: { isArchived: false, minStock: { gt: 0 } },
        select: { id: true, name: true, unit: true, minStock: true },
      }),
      getProductStocks(),
    ])

    const items: AlertItem[] = [
      ...checks.map((c) => {
        const daysLeft = diffJalaliDays(now, c.dueDate)
        return {
          key: `check:${c.id}:${daysLeft < 0 ? "overdue" : "today"}`,
          kind: "check" as const,
          unread: true,
          id: c.id,
          amount: c.amount,
          dueDate: c.dueDate,
          direction: c.direction,
          bankKey: c.bankKey,
          serial: c.serial,
          personName: c.person.name,
          isRegistered: c.isRegistered,
          daysLeft,
        }
      }),
      ...sales.map((s) => ({
        key: `sale:${s.id}:${s.credit}`,
        kind: "sale" as const,
        unread: true,
        id: s.id,
        number: s.number,
        personName: s.person.name,
        credit: s.credit,
        total: s.total,
        date: s.date,
        ageDays: diffJalaliDays(s.date, now),
      })),
      ...products
        .map((p) => ({ ...p, stock: stocks.get(p.id) ?? 0 }))
        .filter((p) => p.stock > 0 && p.stock <= p.minStock)
        .sort((a, b) => a.stock / a.minStock - b.stock / b.minStock)
        .map((p) => ({
          key: `stock:${p.id}:${p.stock}`,
          kind: "stock" as const,
          unread: true,
          id: p.id,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          minStock: p.minStock,
        })),
    ]

    const states = await db.alertState.findMany({ where: { key: { in: items.map((i) => i.key) } } })
    const byKey = new Map(states.map((s) => [s.key, s]))
    const visible = items
      .filter((i) => !byKey.get(i.key)?.dismissedAt)
      .map((i) => ({ ...i, unread: !byKey.get(i.key)?.seenAt }))

    // ردیف‌های کهنه‌ای که دیگر هیچ اعلانی به آن‌ها اشاره نمی‌کند
    await db.alertState
      .deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - STATE_TTL_DAYS * 86_400_000) } } })
      .catch(() => null)

    return ok({
      items: visible,
      unreadCount: visible.filter((i) => i.unread).length,
      totalCount: visible.length,
      dismissedCount: items.length - visible.length,
    })
  } catch (e) {
    return serverError(e)
  }
}

const postSchema = z.object({
  action: z.enum(["seen", "dismiss", "restore"]),
  keys: z.array(z.string().min(1).max(120)).min(1).max(200),
})

/**
 * POST /api/alerts — { action, keys }
 *  seen: دیده شد (عدد زنگ کم می‌شود) | dismiss: از فهرست برود | restore: واگردانی بستن
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, postSchema)
    if (error) return error
    const now = new Date()
    const patch =
      data.action === "seen"
        ? { seenAt: now }
        : data.action === "dismiss"
          ? { seenAt: now, dismissedAt: now }
          : { dismissedAt: null }
    await db.$transaction(
      data.keys.map((key) =>
        db.alertState.upsert({ where: { key }, create: { key, ...patch }, update: patch })
      )
    )
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
