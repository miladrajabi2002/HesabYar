/**
 * بکاپ و بازیابی دیتابیس SQLite — lib/backup.ts
 * SEC-08: رمزگذاری AES-256-GCM اختیاری برای فایل بکاپ هنگام دانلود.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { db } from "./db"
import { jalaliOf } from "./jalali"
import { backupsDir } from "./storage"

const ENC_MAGIC = "HESABYAR-ENC1" // ۱۴ بایت

/** مشتق‌سازی کلید از رمز با scrypt */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
}

/** رمزگذاری فایل بکاپ — قالب: magic + salt(16) + iv(12) + ciphertext + authTag */
export function encryptBackup(data: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveKey(password, salt)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from(ENC_MAGIC, "utf8"), salt, iv, enc, tag])
}

/** آیا فایل رمزگذاری‌شده حساب‌یار است؟ */
export function isEncryptedBackup(data: Buffer): boolean {
  return data.subarray(0, ENC_MAGIC.length).toString("utf8") === ENC_MAGIC
}

/** رمزگشایی فایل بکاپ رمزدار */
export function decryptBackup(data: Buffer, password: string): Buffer {
  if (!isEncryptedBackup(data)) return data
  const body = data.subarray(ENC_MAGIC.length)
  const salt = body.subarray(0, 16)
  const iv = body.subarray(16, 28)
  const tag = body.subarray(body.length - 16)
  const enc = body.subarray(28, body.length - 16)
  const key = deriveKey(password, salt)
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()])
  } catch {
    throw new Error("رمز عبور فایل بکاپ اشتباه است یا فایل خراب است")
  }
}

/**
 * مسیر فیزیکی فایل دیتابیس — DATA_DIR مطلق است؛ مسیر نسبی قدیمی هم هنوز پشتیبانی می‌شود
 */
export function getDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./dev.db"
  if (url.startsWith("file:")) {
    const p = url.slice(5)
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), "prisma", p)
  }
  return path.resolve(process.cwd(), "prisma", "dev.db")
}

/** بکاپ‌ها خارج از وب‌روت، در DATA_DIR/backups (الگوی app) */
export function getBackupsDir(): string {
  return backupsDir()
}

function jalaliStamp(): string {
  const j = jalaliOf(new Date())
  const p = (n: number) => String(n).padStart(2, "0")
  return `${j.jy}-${p(j.jm)}-${p(j.jd)}`
}

/** ساخت بکاپ از دیتابیس جاری (ابتدا WAL چک‌پوینت می‌شود) */
export async function createBackup(): Promise<string> {
  await db.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`.catch(() => null)
  const dir = getBackupsDir()
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `hesab-yar-${jalaliStamp()}.db`)
  fs.copyFileSync(getDbPath(), dest)
  return dest
}

/** نگهداری فقط ۷ نسخه آخر بکاپ */
export function pruneBackups(keep = 7): number {
  const dir = getBackupsDir()
  if (!fs.existsSync(dir)) return 0
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("hesab-yar-") && f.endsWith(".db"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  let removed = 0
  for (const { f } of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, f))
      removed++
    } catch {
      /* ignore */
    }
  }
  return removed
}

export function listBackups(): { name: string; size: number; mtime: string }[] {
  const dir = getBackupsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("hesab-yar-") && f.endsWith(".db"))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f))
      return { name: f, size: st.size, mtime: st.mtime.toISOString() }
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
}

/**
 * بازیابی از فایل آپلودی — با اعتبارسنجی هدر SQLite و
 * بکاپ خودکار از وضعیت فعلی پیش از جایگزینی.
 * فایل رمزگذاری‌شده (SEC-08) با رمز همراه فایل باز می‌شود.
 */
export async function restoreBackup(data: Buffer, passwords: string[] = []): Promise<void> {
  let buf = data
  if (isEncryptedBackup(data)) {
    if (!passwords.length) throw new Error("این فایل بکاپ رمزدار است — رمز عبورش را وارد کنید")
    // به ترتیب: رمزی که کاربر زد، رمز ورود فعلی، رمز بکاپ قدیمی
    let opened: Buffer | null = null
    for (const pw of passwords) {
      try {
        opened = decryptBackup(data, pw)
        break
      } catch {
        /* رمز بعدی */
      }
    }
    if (!opened) throw new Error("رمز این فایل با رمز ورود فعلی یکی نیست — رمزی را که موقع ساختنش داشتید وارد کنید")
    buf = opened
  }
  const header = buf.subarray(0, 16).toString("utf8")
  if (header !== "SQLite format 3\u0000") {
    throw new Error("فایل ارسالی یک دیتابیس SQLite معتبر نیست")
  }
  if (buf.length < 512) {
    throw new Error("فایل دیتابیس ناقص است")
  }
  // بکاپ از وضعیت فعلی پیش از جایگزینی
  await createBackup().catch(() => null)
  // قطع اتصال‌های باز
  await db.$disconnect().catch(() => null)
  const dbPath = getDbPath()
  fs.writeFileSync(dbPath, buf)
  for (const ext of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + ext)
    } catch {
      /* ignore */
    }
  }
}
