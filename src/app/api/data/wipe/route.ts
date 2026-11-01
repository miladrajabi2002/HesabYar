import { NextRequest } from "next/server"
import fs from "node:fs"
import path from "node:path"
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
      // پیوست‌های تصویری اول پاک شوند — چک/فاکتور/شخص/جنس همه می‌روند و پیوست یتیم نمی‌ماند
      db.attachment.deleteMany(),
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
    // فایل‌های پیوست روی دیسک هم پاک شوند — خطایش بحرانی نیست
    try {
      const dir = path.join(process.cwd(), "uploads")
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
