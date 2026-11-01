/**
 * احراز هویت تک‌کاربره — lib/auth.ts
 * ورود وب با نام کاربری/رمز از .env و کوکی امضاشده HMAC.
 */
import crypto from "node:crypto"

export const SESSION_COOKIE = "hesabyar_session"
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60 // ۳۰ روز

/** SEC-05: در پروداکشن مقادیر توسعه‌ای ممنوع — سرویس باید fail-closed بالا بیاید */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    if (isProduction()) {
      throw new Error("[SEC-05] SESSION_SECRET در پروداکشن تنظیم نشده است — سرویس بالا نمی‌آید")
    }
    return "hesabyar-insecure-dev-secret"
  }
  return secret
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8")
  const bb = Buffer.from(b, "utf8")
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba) // حفظ زمان ثابت
    return false
  }
  return crypto.timingSafeEqual(ba, bb)
}

/** بررسی اعتبار ورود (مقاوم به حملات زمانی) — SEC-05: بدون مقادیر پیش‌فرض */
export function verifyCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.APP_USERNAME
  const expectedPass = process.env.APP_PASSWORD
  // در پروداکشن بدون اعتبار env، ورود به‌کل رد می‌شود
  if (!expectedUser || !expectedPass) {
    if (isProduction()) {
      console.error("[SEC-05] APP_USERNAME/APP_PASSWORD تنظیم نشده — ورود رد شد")
      return false
    }
    return safeEqual(username, "admin") && safeEqual(password, "admin1234")
  }
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass)
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC })
  ).toString("base64url")
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token) return false
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return false
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  if (!safeEqual(sig, expected)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number }
    return data.sub === "admin" && typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

/** استخراج مقدار کوکی از هدر */
export function extractCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") || ""
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(header)
  return m ? decodeURIComponent(m[1]) : null
}

/** ───────── توکن چاپ (PRINT) ─────────
 *  صفحهٔ چاپ فاکتور در مرورگر سیستم (خارج از مینی‌اپ تلگرام) باز می‌شود و
 *  کوکی نشست آنجا نیست؛ پس یک توکن امضاشدهٔ کوتاه‌عمر می‌گیرد.
 */
export const PRINT_TOKEN_MAX_AGE_SEC = 10 * 60 // ۱۰ دقیقه

export function createPrintToken(resource: string, refId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "print",
      res: resource,
      ref: refId,
      exp: Math.floor(Date.now() / 1000) + PRINT_TOKEN_MAX_AGE_SEC,
    })
  ).toString("base64url")
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifyPrintToken(
  token: string | null | undefined,
  resource: string,
  refId: string
): boolean {
  if (!token) return false
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return false
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
  if (!safeEqual(sig, expected)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string
      res?: string
      ref?: string
      exp?: number
    }
    return (
      data.sub === "print" &&
      data.res === resource &&
      data.ref === refId &&
      typeof data.exp === "number" &&
      data.exp > Math.floor(Date.now() / 1000)
    )
  } catch {
    return false
  }
}
