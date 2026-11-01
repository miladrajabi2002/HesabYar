/**
 * خروجی CSV/Excel — lib/csv.ts (ADV-02)
 * سازنده CSV با BOM برای نمایش صحیح فارسی در اکسل.
 */

/** escape یک فیلد CSV طبق استاندارد RFC 4180 */
function escapeField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** ساخت CSV کامل — ردیف اول عنوان ستون‌ها */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeField).join(",")]
  for (const row of rows) lines.push(row.map(escapeField).join(","))
  // BOM برای UTF-8 تا اکسل فارسی را درست بخواند
  return "\uFEFF" + lines.join("\r\n")
}

/** پاسخ CSV برای دانلود با نام‌گذاری فارسی */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(filename)}.csv"`,
      "cache-control": "no-store",
    },
  })
}
