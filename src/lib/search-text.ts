/**
 * یکدست‌سازی متن برای جستجو — مشترک بین سرور (/api/search) و کلاینت (هایلایت نتیجه)
 *  • ي/ى/ك عربی → ی/ک فارسی، ة → ه
 *  • ارقام فارسی/عربی → لاتین
 *  • نیم‌فاصله حذف می‌شود («می‌شود» و «میشود» یکی‌اند)، حروف لاتین کوچک
 */
const CHAR_FOLD: Record<string, string> = {
  "ي": "ی",
  "ى": "ی",
  "ك": "ک",
  "ة": "ه",
  "‌": "",
  "‏": "",
  "‎": "",
}

function foldChar(c: string): string {
  if (c in CHAR_FOLD) return CHAR_FOLD[c]
  const code = c.charCodeAt(0)
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0)
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660)
  const lower = c.toLowerCase()
  return lower.length === 1 ? lower : c
}

export function foldSearchText(s: string): string {
  let out = ""
  for (const c of s) out += foldChar(c)
  return out
}

/** بازهٔ تطابق عبارت در متن اصلی (با در نظر گرفتن یکدست‌سازی) — برای هایلایت */
export function findMatch(text: string, query: string): [number, number] | null {
  const q = foldSearchText(query.trim())
  if (!q) return null
  let folded = ""
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i])
    for (let k = 0; k < f.length; k++) {
      folded += f[k]
      map.push(i)
    }
  }
  const idx = folded.indexOf(q)
  if (idx < 0) return null
  return [map[idx], map[idx + q.length - 1] + 1]
}

/**
 * گونه‌های عبارت برای جستجوی SQL (LIKE نمی‌تواند ي/ی را یکی بداند):
 * همان عبارت، نسخهٔ فارسی‌شده، نسخهٔ با حروف عربی و نسخهٔ ارقام لاتین/فارسی
 */
export function searchVariants(raw: string): string[] {
  const q = raw.trim()
  const fa = q.replace(/[يى]/g, "ی").replace(/ك/g, "ک")
  const ar = fa.replace(/ی/g, "ي").replace(/ک/g, "ك")
  const latin = fa
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  const persianDigits = latin.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
  return Array.from(new Set([q, fa, ar, latin, persianDigits].filter(Boolean)))
}
