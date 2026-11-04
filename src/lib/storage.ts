/**
 * مسیر داده‌ها خارج از وب‌روت nginx (DATA_DIR) — دیتابیس، پیوست‌ها و بکاپ‌ها
 * الگوی پروژهٔ میلاد رجابی (app): داده‌های زنده هرگز داخل ریپوی کد نیستند؛
 * کد و داده مسیرهای جدا دارند تا استقرار، بکاپ و مجوزها مستقل باشند.
 */
import fs from "node:fs"
import path from "node:path"

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data")
}

export function uploadsDir(): string {
  const dir = path.join(dataDir(), "uploads")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function backupsDir(): string {
  const dir = path.join(dataDir(), "backups")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
