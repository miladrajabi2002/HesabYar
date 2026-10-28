/**
 * بکاپ و بازیابی دیتابیس SQLite — lib/backup.ts
 */
import fs from "node:fs"
import path from "node:path"
import { db } from "./db"
import { jalaliOf } from "./jalali"

/** مسیر فیزیکی فایل دیتابیس (پشتیبانی از مسیر نسبی و مطلق) */
export function getDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./dev.db"
  if (url.startsWith("file:")) {
    const p = url.slice(5)
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), "prisma", p)
  }
  return path.resolve(process.cwd(), "prisma", "dev.db")
}

export function getBackupsDir(): string {
  return path.join(process.cwd(), "backups")
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
 */
export async function restoreBackup(data: Buffer): Promise<void> {
  const header = data.subarray(0, 16).toString("utf8")
  if (header !== "SQLite format 3\u0000") {
    throw new Error("فایل ارسالی یک دیتابیس SQLite معتبر نیست")
  }
  if (data.length < 512) {
    throw new Error("فایل دیتابیس ناقص است")
  }
  // بکاپ از وضعیت فعلی پیش از جایگزینی
  await createBackup().catch(() => null)
  // قطع اتصال‌های باز
  await db.$disconnect().catch(() => null)
  const dbPath = getDbPath()
  fs.writeFileSync(dbPath, data)
  for (const ext of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + ext)
    } catch {
      /* ignore */
    }
  }
}
