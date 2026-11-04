/**
 * رمز حساب — lib/account-password.ts
 * یک رمز برای همه‌چیز: ورود به حساب‌یار و رمز فایل‌های بکاپ (دانلود و تلگرام).
 *  • تا وقتی از «تنظیمات ← امنیت» رمز تازه‌ای گذاشته نشده، APP_PASSWORD از .env همان رمز است.
 *  • رمز تازه دو جور نگه داشته می‌شود: هش scrypt برای ورود، و نسخهٔ رمزشده با کلیدی از SESSION_SECRET
 *    تا بکاپ شبانهٔ تلگرام بی‌حضور کاربر با همان رمز قفل شود (کلید در .env است، نه داخل بکاپ).
 */
import crypto from "node:crypto"
import { db } from "./db"
import { safeEqual, verifyEnvPassword, verifyUsername } from "./auth"

export const MIN_PASSWORD = 8

interface Stored {
  hash: string
  salt: string
  sealed: string
  changedAt: string
}

function sealKey(): Buffer {
  const secret = process.env.SESSION_SECRET || "hesabyar-insecure-dev-secret"
  return crypto.createHash("sha256").update(`account-password:${secret}`).digest()
}

function seal(text: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(), iv)
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64")
}

function unseal(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, "base64")
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(buf.length - 16))
    return Buffer.concat([decipher.update(buf.subarray(12, buf.length - 16)), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

function hashOf(password: string, salt: string): string {
  return crypto.scryptSync(password, Buffer.from(salt, "base64"), 32, { N: 16384, r: 8, p: 1 }).toString("base64")
}

async function stored(): Promise<Stored | null> {
  const row = await db.setting.findUnique({ where: { id: "default" }, select: { accountPassword: true } }).catch(() => null)
  if (!row?.accountPassword) return null
  try {
    return JSON.parse(row.accountPassword) as Stored
  } catch {
    return null
  }
}

export async function verifyAccountPassword(password: string): Promise<boolean> {
  const s = await stored()
  if (!s) return verifyEnvPassword(password)
  return safeEqual(hashOf(password, s.salt), s.hash)
}

export async function verifyLogin(username: string, password: string): Promise<boolean> {
  // هر دو بررسی اجرا می‌شوند تا زمان پاسخ نام کاربری درست/غلط را لو ندهد
  const [user, pass] = [verifyUsername(username), await verifyAccountPassword(password)]
  return user && pass
}

/** رمز فعلی به‌صورت متن — فقط برای قفل/باز کردن بکاپ */
export async function backupPassword(): Promise<string | null> {
  const s = await stored()
  if (s) return unseal(s.sealed)
  return process.env.APP_PASSWORD || null
}

/** رمزهایی که بازیابی به ترتیب امتحان می‌کند: رمز فعلی، رمز بکاپ قدیمی */
export async function restoreCandidates(): Promise<string[]> {
  const [current, legacy] = await Promise.all([
    backupPassword(),
    db.setting.findUnique({ where: { id: "default" }, select: { backupPassword: true } }).then((r) => r?.backupPassword ?? null).catch(() => null),
  ])
  return [current, legacy].filter((x): x is string => !!x)
}

export async function passwordStatus(): Promise<{ source: "app" | "env"; changedAt: string | null }> {
  const s = await stored()
  return s ? { source: "app", changedAt: s.changedAt } : { source: "env", changedAt: null }
}

export async function setAccountPassword(password: string): Promise<void> {
  const salt = crypto.randomBytes(16).toString("base64")
  const value: Stored = { hash: hashOf(password, salt), salt, sealed: seal(password), changedAt: new Date().toISOString() }
  await db.setting.upsert({
    where: { id: "default" },
    update: { accountPassword: JSON.stringify(value) },
    create: { id: "default", accountPassword: JSON.stringify(value) },
  })
}
