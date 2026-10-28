/**
 * احراز هویت تک‌کاربره — lib/auth.ts
 * ورود وب با نام کاربری/رمز از .env و کوکی امضاشده HMAC.
 */
import crypto from "node:crypto"

export const SESSION_COOKIE = "hesabyar_session"
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60 // ۳۰ روز

function getSecret(): string {
  return process.env.SESSION_SECRET || "hesabyar-insecure-dev-secret"
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

/** بررسی اعتبار ورود (مقاوم به حملات زمانی) */
export function verifyCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.APP_USERNAME || "admin"
  const expectedPass = process.env.APP_PASSWORD || "admin1234"
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
