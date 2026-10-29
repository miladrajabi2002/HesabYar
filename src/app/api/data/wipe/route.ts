import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

/** POST /api/data/wipe — پاک‌کردن همه داده‌های عملیاتی (تنظیمات و لاگ می‌ماند) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const body = (await req.json().catch(() => ({}))) as { confirm?: string }
    if (body.confirm !== "WIPE") {
      return fail("برای تأیید، مقدار confirm=WIPE را ارسال کنید", 400)
    }
    await db.$transaction([
      db.notificationLog.deleteMany(),
      db.transaction.deleteMany(),
      db.checkPaper.deleteMany(),
      db.settlement.deleteMany(),
      db.invoiceItem.deleteMany(),
      db.invoice.deleteMany(),
      db.product.deleteMany(),
      db.person.deleteMany(),
      db.account.deleteMany(),
    ])
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
