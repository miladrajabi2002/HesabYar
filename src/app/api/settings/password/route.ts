import { NextRequest } from "next/server"
import { z } from "zod"
import { fail, ok, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { MIN_PASSWORD, setAccountPassword, verifyAccountPassword } from "@/lib/account-password"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const schema = z.object({
  current: z.string().min(1, "رمز فعلی را بنویسید").max(200),
  next: z.string().min(MIN_PASSWORD, `رمز تازه حداقل ${MIN_PASSWORD} کاراکتر باشد`).max(200),
})

/** POST /api/settings/password — رمز تازه برای ورود و همهٔ بکاپ‌ها */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  const rl = rateLimit(`password:${clientIp(req)}`, 5, 10 * 60_000)
  if (!rl.ok) return fail(`تلاش‌های زیاد؛ ${Math.ceil(rl.retryAfterSec / 60)} دقیقه دیگر امتحان کنید`, 429)
  try {
    const { data, error } = await parseBody(req, schema)
    if (error) return error
    if (!(await verifyAccountPassword(data.current))) return fail("رمز فعلی درست نیست", 403)
    if (data.current === data.next) return fail("رمز تازه با رمز فعلی یکی است", 400)
    await setAccountPassword(data.next)
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
