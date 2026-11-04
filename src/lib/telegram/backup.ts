/**
 * بکاپ خودکار رمزدار به تلگرام — lib/telegram/backup.ts
 * فایل دیتابیس با AES-256-GCM (همان قالب SEC-08 در lib/backup.ts) رمز می‌شود و
 * به‌صورت سند برای ادمین ارسال می‌شود. رمز = رمز ورود؛ بازیابی: تنظیمات ← بازیابی از فایل.
 */
import fs from "node:fs"
import { db } from "@/lib/db"
import { createBackup, encryptBackup } from "@/lib/backup"
import { backupPassword } from "@/lib/account-password"
import { jalaliOf, formatJalaliWithWeekday } from "@/lib/jalali"
import { resolveTelegramConfig } from "./config"
import { alreadySent } from "./alerts"

const MAX_TELEGRAM_FILE = 49 * 1024 * 1024

export async function sendBackupToTelegram(opts: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const setting = await db.setting.findUnique({ where: { id: "default" } }).catch(() => null)
  if (!opts.force && !setting?.telegramBackup) return { ok: false, error: "بکاپ تلگرام خاموش است" }
  // همان رمز ورود (تنظیمات ← امنیت ← رمز ورود و بکاپ)
  const password = await backupPassword()
  if (!password) return { ok: false, error: "رمز ورود تنظیم نشده است" }

  const cfg = await resolveTelegramConfig()
  if (!cfg.token || !cfg.chatId) return { ok: false, error: "ربات یا شناسهٔ چت تنظیم نشده است" }

  const j = jalaliOf(new Date())
  const p = (n: number) => String(n).padStart(2, "0")
  const stamp = `${j.jy}-${p(j.jm)}-${p(j.jd)}`
  const key = `TG_BACKUP:${stamp}`
  if (!opts.force && (await alreadySent(key))) return { ok: true }

  const file = await createBackup()
  const enc = encryptBackup(fs.readFileSync(file), password)
  if (enc.length > MAX_TELEGRAM_FILE) return { ok: false, error: "حجم بکاپ از سقف ارسال تلگرام بیشتر است" }

  const form = new FormData()
  form.append("chat_id", cfg.chatId)
  form.append(
    "caption",
    `🔐 بکاپ رمزدار حساب‌یار\n${formatJalaliWithWeekday(new Date())}\n\n` +
      `برای بازیابی: تنظیمات ← بازیابی از فایل ← همین فایل (رمز = رمز ورود)`
  )
  form.append("disable_notification", "true")
  form.append(
    "document",
    new Blob([new Uint8Array(enc)], { type: "application/octet-stream" }),
    `hesab-yar-${stamp}.db.enc`
  )

  let ok = false
  let error: string | undefined
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendDocument`, { method: "POST", body: form })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    ok = res.ok && data.ok !== false
    error = ok ? undefined : data.description || "ارسال فایل ناموفق بود"
  } catch (e) {
    error = String(e)
  }
  await db.notificationLog
    .create({ data: { chatId: cfg.chatId, message: "بکاپ رمزدار", alertType: opts.force ? "TG_BACKUP_TEST" : key, status: ok ? "SENT" : "FAILED" } })
    .catch(() => null)
  return ok ? { ok: true } : { ok: false, error }
}
