import { NextRequest } from "next/server"
import { fail } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

/**
 * POST /api/telegram/webhook — اختیاری
 * پیش‌فرض پروژه polling است؛ این مسیر فقط زمانی فعال می‌شود که
 * TELEGRAM_WEBHOOK_SECRET در .env تنظیم شده باشد.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) {
    return fail("وبهوک غیرفعال است؛ حالت پیش‌فرض پروژه polling است", 403)
  }
  const header = req.headers.get("x-telegram-bot-api-secret-token")
  if (header !== secret) {
    return fail("توکن امنیتی وبهوک نامعتبر است", 401)
  }
  // پردازش آپدیت لازم نیست — هشدارها مستقیم ارسال می‌شوند
  return Response.json({ ok: true })
}
