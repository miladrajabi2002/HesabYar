import { NextRequest, NextResponse } from "next/server"
import { ok, fail, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { buildAuthenticationOptions, verifyAuthenticationResponseWrapper } from "@/lib/passkey"
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** آیا کلیدی ثبت شده؟ (برای نمایش دکمه ورود بیومتریک) */
export async function GET(req: NextRequest) {
  const rl = rateLimit(`passkey-options:${clientIp(req)}`, 30, 5 * 60_000)
  if (!rl.ok) return fail("درخواست‌های زیاد؛ کمی بعد دوباره امتحان کنید", 429)
  try {
    const count = await db.passkey.count()
    const options = count > 0 ? await buildAuthenticationOptions(req) : null
    return ok({ available: count > 0, count, options })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/passkey/login — ورود با Face ID / Touch ID و صدور نشست */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`passkey-login:${clientIp(req)}`, 10, 5 * 60_000)
  if (!rl.ok) return fail(`تلاش‌های زیاد؛ ${Math.ceil(rl.retryAfterSec / 60)} دقیقه دیگر امتحان کنید`, 429)

  try {
    const body = (await req.json().catch(() => null)) as {
      credential?: Record<string, unknown>
    } | null
    if (!body?.credential) return fail("پاسخ کلید ارسال نشده است", 400)

    const verification = await verifyAuthenticationResponseWrapper(req, body.credential)
    if (!verification.verified) {
      return fail("تأیید هویت ناموفق بود", 401)
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    })
    return res
  } catch (e) {
    return fail(e instanceof Error ? e.message : "ورود با کلید ناموفق بود", 400)
  }
}
