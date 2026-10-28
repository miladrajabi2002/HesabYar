/**
 * اعتبارسنجی initData مینی‌اپ تلگرام — دقیقاً طبق مستندات رسمی تلگرام:
 * secretKey     = HMAC_SHA256(key="WebAppData", message=botToken)
 * computedHash  = HMAC_SHA256(key=secretKey, message=dataCheckString)
 * dataCheckString = پارامترهای مرتب‌شده (بدون hash) به شکل key=value با جداکننده \n
 */
import crypto from "node:crypto"

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface InitDataResult {
  valid: boolean
  user?: TelegramUser
  authDate?: number
  error?: string
}

export function validateInitData(initData: string, botToken: string, maxAgeSec = 24 * 60 * 60): InitDataResult {
  if (!initData || !botToken) {
    return { valid: false, error: "داده تلگرام یا توکن ربات موجود نیست" }
  }
  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { valid: false, error: "قالب داده تلگرام نامعتبر است" }
  }
  const hash = params.get("hash")
  if (!hash) {
    return { valid: false, error: "پارامتر hash در داده تلگرام وجود ندارد" }
  }
  params.delete("hash")

  const entries = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n")

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

  const a = Buffer.from(computedHash, "utf8")
  const b = Buffer.from(hash, "utf8")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: "امضای داده تلگرام نامعتبر است" }
  }

  const authDate = Number(params.get("auth_date") || 0)
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSec) {
    return { valid: false, error: "اعتبار داده تلگرام منقضی شده است (بیش از ۲۴ ساعت)" }
  }

  let user: TelegramUser | undefined
  try {
    user = (JSON.parse(params.get("user") || "null") as TelegramUser | null) ?? undefined
  } catch {
    user = undefined
  }

  return { valid: true, user, authDate }
}
