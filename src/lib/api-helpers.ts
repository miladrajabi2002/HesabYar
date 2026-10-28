/**
 * ابزارهای مشترک API — lib/api-helpers.ts
 */
import { NextResponse } from "next/server"
import type { ZodType } from "zod"
import { extractCookie, SESSION_COOKIE, verifySessionToken } from "./auth"
import { db } from "./db"
import { validateInitData } from "./telegram/validateInitData"

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init)
}

/** پاسخ خطا با پیام فارسی */
export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

type ParseResult<T> = { data: T; error?: never } | { data?: never; error: NextResponse }

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { error: fail("بدنه درخواست معتبر نیست", 400) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "ورودی نامعتبر است"
    return { error: fail(msg, 400) }
  }
  return { data: parsed.data }
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): ParseResult<T> {
  const url = new URL(req.url)
  const obj: Record<string, string> = {}
  url.searchParams.forEach((v, k) => {
    if (v !== "") obj[k] = v
  })
  const parsed = schema.safeParse(obj)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "پارامترهای فیلتر نامعتبر است"
    return { error: fail(msg, 400) }
  }
  return { data: parsed.data }
}

/**
 * درخواست‌های API یا با کوکی نشست وب معتبر یا با initData معتبر مینی‌اپ تلگرام
 * (کاربر == ادمین) مجاز هستند. خروجی null یعنی مجاز.
 */
export async function requireApiAuth(req: Request): Promise<NextResponse | null> {
  // ۱) نشست وب
  const token = extractCookie(req, SESSION_COOKIE)
  if (token && verifySessionToken(token)) return null

  // ۲) مینی‌اپ تلگرام (سخت‌گیرانه)
  const initData = req.headers.get("x-telegram-init-data")
  if (initData) {
    const setting = await db.setting.findUnique({ where: { id: "default" } }).catch(() => null)
    const botToken = setting?.botToken?.trim() || process.env.BOT_TOKEN?.trim() || ""
    const adminChatId = setting?.adminChatId?.trim() || process.env.ADMIN_CHAT_ID?.trim() || ""
    if (botToken) {
      const result = validateInitData(initData, botToken)
      if (result.valid) {
        if (!adminChatId || String(result.user?.id ?? "") === adminChatId) return null
        return fail("دسترسی به این حساب‌یار فقط برای ادمین مجاز است", 401)
      }
      return fail(result.error || "اعتبارسنجی تلگرام ناموفق بود", 401)
    }
    return fail("ربات تلگرام هنوز تنظیم نشده است", 401)
  }

  return fail("ابتدا وارد حساب‌یار شوید", 401)
}

/** خطای سرور با لاگ و پیام عمومی فارسی */
export function serverError(e: unknown, message = "خطای داخلی سرور رخ داد"): NextResponse {
  console.error("[hesabyar-api]", e)
  return fail(message, 500)
}
