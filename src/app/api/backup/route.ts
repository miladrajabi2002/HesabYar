import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import { fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { createBackup } from "@/lib/backup"
import { jalaliOf } from "@/lib/jalali"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/backup — دانلود فایل بکاپ دیتابیس با نام تاریخ شمسی */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth

  const rl = rateLimit(`backup:${clientIp(req)}`, 6, 10 * 60_000)
  if (!rl.ok) return fail(`درخواست‌های زیاد؛ ${rl.retryAfterSec} ثانیه دیگر امتحان کنید`, 429)

  try {
    const filePath = await createBackup()
    const buffer = fs.readFileSync(filePath)
    const j = jalaliOf(new Date())
    const p = (n: number) => String(n).padStart(2, "0")
    const name = `hesab-yar-backup-${j.jy}-${p(j.jm)}-${p(j.jd)}.db`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    return serverError(e, "ساخت فایل بکاپ ناموفق بود")
  }
}
