import { NextRequest, NextResponse } from "next/server"
import { fail, parseBody } from "@/lib/api-helpers"
import { loginSchema } from "@/lib/validation"
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SEC, verifyCredentials } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const rl = rateLimit(`login:${clientIp(req)}`, 8, 5 * 60_000)
  if (!rl.ok) {
    return fail(`تلاش‌های زیاد؛ ${Math.ceil(rl.retryAfterSec / 60)} دقیقه دیگر امتحان کنید`, 429)
  }

  const { data, error } = await parseBody(req, loginSchema)
  if (error) return error

  if (!verifyCredentials(data.username, data.password)) {
    return fail("نام کاربری یا رمز عبور اشتباه است", 401)
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
}
