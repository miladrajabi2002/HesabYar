import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { restoreBackup } from "@/lib/backup"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_BACKUP_SIZE = 100 * 1024 * 1024 // ۱۰۰ مگابایت

/** POST /api/backup/restore — بازیابی از فایل آپلودی (با بکاپ خودکار پیش از جایگزینی) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth

  const rl = rateLimit(`restore:${clientIp(req)}`, 3, 10 * 60_000)
  if (!rl.ok) return fail(`درخواست‌های زیاد؛ ${rl.retryAfterSec} ثانیه دیگر امتحان کنید`, 429)

  try {
    const formData = await req.formData().catch(() => null)
    if (!formData) return fail("فایل بکاپ ارسال نشده است", 400)

    const file = formData.get("file")
    if (!(file instanceof File)) return fail("فایل بکاپ ارسال نشده است", 400)
    if (file.size === 0) return fail("فایل ارسالی خالی است", 400)
    if (file.size > MAX_BACKUP_SIZE) return fail("حجم فایل بیش از حد مجاز (۱۰۰ مگابایت) است", 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    await restoreBackup(buffer)
    return ok({ ok: true, message: "بازیابی با موفقیت انجام شد" })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "بازیابی بکاپ ناموفق بود", 400)
  }
}
