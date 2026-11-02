import { NextRequest } from "next/server"
import { z } from "zod"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { sendMorningReminder } from "@/lib/telegram/morning"
import { sendBackupToTelegram } from "@/lib/telegram/backup"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const actionSchema = z.object({
  action: z.enum(["morning", "backup"], { message: "عملیات نامعتبر است" }),
})

/**
 * POST /api/telegram/action — اجرای دستی از صفحهٔ تنظیمات:
 *  morning → ارسال همین حالای «چک‌های امروز» با دکمهٔ پاس/برگشت
 *  backup  → ارسال همین حالای بکاپ رمزدار به تلگرام
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  const rl = rateLimit(`tg-action:${clientIp(req)}`, 6, 10 * 60_000)
  if (!rl.ok) return fail(`درخواست‌های زیاد؛ ${rl.retryAfterSec} ثانیه دیگر امتحان کنید`, 429)
  try {
    const { data, error } = await parseBody(req, actionSchema)
    if (error) return error
    if (data.action === "morning") {
      const r = await sendMorningReminder({ force: true })
      if (!r.sent) return fail(r.error || "ارسال ناموفق بود", 400)
      return ok({ ok: true, message: `یادآوری با ${r.count} چک ارسال شد` })
    }
    const r = await sendBackupToTelegram({ force: true })
    if (!r.ok) return fail(r.error || "ارسال بکاپ ناموفق بود", 400)
    return ok({ ok: true, message: "بکاپ رمزدار به تلگرام رفت" })
  } catch (e) {
    return serverError(e, "عملیات ناموفق بود")
  }
}
