import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyPrintToken, extractCookie, SESSION_COOKIE, verifySessionToken } from "@/lib/auth"
import { invoiceInclude } from "@/lib/includes"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"
import { getBank } from "@/lib/banks"
import { BRAND_SVG } from "@/lib/brand"

export const dynamic = "force-dynamic"

/**
 * GET /api/invoices/[id]/print?t=TOKEN — صفحهٔ چاپ مستقل فاکتور
 *window.print() داخل WebView تلگرام کار نمی‌کند؛ به‌جایش این صفحهٔ HTML
 * مستقل (با استایل داخلی) در مرورگر سیستم باز می‌شود و آنجا چاپ/PDF می‌گیرد.
 * مجوز: توکن امضاشدهٔ کوتاه‌عمر یا کوکی نشست.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const token = new URL(req.url).searchParams.get("t")

    const authed =
      verifyPrintToken(token, "invoice", id) ||
      verifySessionToken(extractCookie(req, SESSION_COOKIE))
    if (!authed) {
      return new NextResponse(
        `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>لینک منقضی شده</title>
<link rel="stylesheet" href="/fonts/print.css">
<style>body{font-family:Tahoma,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f8fa;color:#334155}div{text-align:center;padding:2rem}h1{font-size:1.1rem}p{font-size:.85rem;color:#64748b}</style>
</head><body><div><h1>⛔ لینک چاپ معتبر نیست یا منقضی شده است</h1><p>از داخل حساب‌یار دوباره روی «چاپ فاکتور» بزنید.</p></div></body></html>`,
        { status: 401, headers: { "content-type": "text/html; charset=utf-8" } }
      )
    }

    const inv = await db.invoice.findUnique({ where: { id }, include: invoiceInclude })
    if (!inv) return new NextResponse("فاکتور پیدا نشد", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } })

    const html = renderInvoiceHtml(inv)
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  } catch {
    return new NextResponse("خطای سرور", { status: 500, headers: { "content-type": "text/html; charset=utf-8" } })
  }
}

type InvoiceWithInclude = NonNullable<Awaited<ReturnType<typeof db.invoice.findFirst<{ include: typeof invoiceInclude }>>>>

/* ───────── قالب HTML چاپ — استایل کامل داخلی، بدون وابستگی ───────── */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function renderInvoiceHtml(inv: InvoiceWithInclude): string {
  const isSale = inv.type === "SALE"
  const counterpartyLabel = isSale ? "خریدار" : "فروشنده"
  const dateFa = formatJalaliWithWeekday(new Date(inv.date))
  const rows = inv.items
    .map(
      (it, i) => `<tr>
  <td class="c">${toPersianDigits(i + 1)}</td>
  <td class="s"><b>${esc(it.productName)}</b>${it.brand ? ` <span class="mut">— ${esc(it.brand)}</span>` : ""}${it.code ? ` <span class="mut">کد ${esc(it.code)}</span>` : ""}</td>
  <td class="c">${toPersianDigits(it.quantity)}</td>
  <td class="c">${esc(formatUnit(it.unit))}</td>
  <td class="c n">${formatToman(it.unitPrice, false)}</td>
  <td class="c n"><b>${formatToman(it.total, false)}</b></td>
</tr>`
    )
    .join("\n")

  const checksRows =
    inv.checks.length > 0
      ? inv.checks
          .map(
            (c) => `<tr>
  <td>${esc(getBank(c.bankKey).name)}</td>
  <td class="c n">${c.serial ? toPersianDigits(c.serial) : "—"}</td>
  <td class="c">${formatJalaliWithWeekday(new Date(c.dueDate))}</td>
  <td class="c n"><b>${formatToman(c.amount, false)}</b></td>
</tr>`
          )
          .join("\n")
      : ""

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاکتور ${toPersianDigits(inv.number)} — ${esc(inv.person.name)}</title>
<link rel="stylesheet" href="/fonts/print.css">
<style>
  @page { size: A4; margin: 10mm 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Vazirmatn, "Segoe UI", Tahoma, sans-serif;
    color: #111827; background: #eef1f4; font-size: 12px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    max-width: 720px; margin: 0 auto; padding: 18px 20px 26px;
    background: #fff; min-height: calc(100vh - 20px);
  }
  /* سربرگ */
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2.5px solid #0e7c66; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand svg { width: 44px; height: 44px; }
  .brand .t1 { font-size: 17px; font-weight: 800; letter-spacing: -.2px; }
  .brand .t2 { font-size: 10px; color: #4b5563; margin-top: 1px; }
  .doc { text-align: left; }
  .doc .kind { display: inline-block; background: ${isSale ? "#0e7c66" : "#b91c1c"}; color: #fff; font-weight: 800; font-size: 12px; padding: 4px 12px; border-radius: 9px; }
  .doc .no { font-size: 11px; color: #374151; margin-top: 5px; }
  /* مشخصات */
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0 10px; font-size: 11.5px; }
  .meta p { margin: 0; }
  .mut { color: #6b7280; }
  /* جدول */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f0f5f3; border: 1px solid #cbd5d1; padding: 7px 6px; font-weight: 700; }
  td { border: 1px solid #d7dedb; padding: 6.5px 6px; vertical-align: middle; }
  .c { text-align: center; }
  .s { text-align: right; }
  .n { font-variant-numeric: tabular-nums; }
  tr { page-break-inside: avoid; }
  /* جمع‌ها */
  .sumwrap { display: flex; justify-content: space-between; gap: 14px; margin-top: 12px; align-items: flex-start; }
  .totals { width: 290px; border-collapse: collapse; font-size: 11px; }
  .totals td { border: 1px solid #d7dedb; padding: 6px 10px; }
  .totals .k { background: #f6f8f7; width: 46%; }
  .totals .grand td { font-weight: 800; background: #e8f3f0; font-size: 12px; }
  .paybox { flex: 1; border: 1px solid #d7dedb; border-radius: 10px; padding: 9px 12px; font-size: 11px; }
  .paybox h3 { margin: 0 0 6px; font-size: 11.5px; color: #0e7c66; }
  .paybox table { border: 0; }
  .paybox td { border: 0; border-bottom: 1px dashed #e2e8e5; padding: 4.5px 2px; }
  .paybox tr:last-child td { border-bottom: 0; }
  .badge { display: inline-block; border-radius: 7px; padding: 2px 8px; font-weight: 700; font-size: 10.5px; }
  .b-ok { background: #e8f3f0; color: #0e7c66; }
  .b-debt { background: #fdf3d7; color: #92600a; }
  .checks td { padding: 5px 6px; }
  /* امضا و پانوشت */
  .sign { display: flex; justify-content: space-between; margin-top: 34px; gap: 20px; }
  .sign div { flex: 1; text-align: center; font-size: 11px; color: #374151; }
  .sign .line { border-top: 1.5px dashed #9ca3af; margin-top: 26px; padding-top: 5px; }
  .foot { margin-top: 22px; text-align: center; font-size: 10px; color: #8b95a1; border-top: 1px solid #e8ecef; padding-top: 8px; }
  /* نوار چاپ (فقط صفحه) */
  .printbar {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 10px;
    max-width: 720px; margin: 0 auto 10px; padding: 10px 12px; background: #ffffffdd; backdrop-filter: blur(6px);
    border: 1px solid #dfe5ea; border-radius: 14px; font-size: 12px; color: #475569;
  }
  .printbar button {
    font-family: inherit; font-size: 13px; font-weight: 800; color: #fff; background: #0e7c66;
    border: 0; border-radius: 11px; padding: 10px 26px; cursor: pointer;
  }
  .printbar button:active { transform: scale(.97); }
  @media print {
    body { background: #fff; }
    .sheet { max-width: none; margin: 0; padding: 0; min-height: auto; }
    .printbar { display: none !important; }
  }
  @media (max-width: 560px) {
    .sumwrap { flex-direction: column; }
    .meta { grid-template-columns: 1fr; }
    .doc { text-align: right; }
    .head { flex-direction: column; align-items: stretch; }
  }
</style>
</head>
<body>

<div class="printbar">
  <span>برای چاپ یا ذخیره PDF:</span>
  <button type="button" onclick="window.print()">🖨️ چاپ فاکتور</button>
</div>

<div class="sheet">
  <header class="head">
    <div class="brand">
      ${BRAND_SVG}
      <div>
        <div class="t1">حساب‌یار</div>
        <div class="t2">دفتر فروش و خرید — نسخهٔ چاپی</div>
      </div>
    </div>
    <div class="doc">
      <span class="kind">${isSale ? "فاکتور فروش" : "فاکتور خرید"}</span>
      <div class="no n">شماره: ${toPersianDigits(inv.number)}</div>
    </div>
  </header>

  <div class="meta">
    <p><span class="mut">تاریخ صدور:</span> <span class="n">${dateFa}</span></p>
    <p style="text-align:left"><span class="mut">${counterpartyLabel}:</span> <b>${esc(inv.person.name)}</b>${inv.person.company ? ` <span class="mut">(${esc(inv.person.company)})</span>` : ""}</p>
    <p><span class="mut">وضعیت تسویه:</span> ${
      inv.credit > 0
        ? `<span class="badge b-debt">مانده ${formatToman(inv.credit, false)} — نسیه</span>`
        : `<span class="badge b-ok">تسویه شده</span>`
    }</p>
    ${inv.person.phone ? `<p style="text-align:left"><span class="mut">تلفن:</span> <span class="n">${toPersianDigits(inv.person.phone)}</span></p>` : ""}
    ${inv.note ? `<p style="grid-column:1/-1"><span class="mut">یادداشت:</span> ${esc(inv.note)}</p>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:34px">ردیف</th>
        <th class="s">شرح کالا</th>
        <th style="width:56px">تعداد</th>
        <th style="width:64px">واحد</th>
        <th style="width:110px">فی (تومان)</th>
        <th style="width:120px">مبلغ کل (تومان)</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6" class="c mut" style="padding:12px">قلمی ثبت نشده است</td></tr>`}
    </tbody>
  </table>

  <div class="sumwrap">
    <div class="paybox">
      <h3>پرداخت‌ها</h3>
      <table>
        <tr><td>نقدی</td><td class="n" style="text-align:left">${formatToman(inv.paidCash, false)}</td></tr>
        <tr><td>چک</td><td class="n" style="text-align:left">${formatToman(inv.paidChecks, false)}</td></tr>
        <tr><td>مانده</td><td style="text-align:left">${
          inv.credit > 0 ? `<b class="n">${formatToman(inv.credit, false)}</b>` : `<span class="badge b-ok">تسویه ✓</span>`
        }</td></tr>
      </table>
      ${
        inv.checks.length > 0
          ? `<h3 style="margin-top:9px">چک‌های این فاکتور</h3>
      <table class="checks">
        <tr><td class="mut">بانک</td><td class="mut c">سریال</td><td class="mut c">سررسید</td><td class="mut c">مبلغ</td></tr>
        ${checksRows}
      </table>`
          : ""
      }
    </div>

    <table class="totals">
      <tr><td class="k">جمع اقلام</td><td class="n" style="text-align:left">${formatToman(inv.subtotal, false)}</td></tr>
      ${inv.discount > 0 ? `<tr><td class="k">تخفیف</td><td class="n" style="text-align:left">−${formatToman(inv.discount, false)}</td></tr>` : ""}
      <tr class="grand"><td>مبلغ نهایی</td><td class="n" style="text-align:left">${formatToman(inv.total, false)}</td></tr>
    </table>
  </div>

  <div class="sign">
    <div><span>مهر و امضای فروشنده</span><div class="line"></div></div>
    <div><span>امضای ${counterpartyLabel}</span><div class="line"></div></div>
  </div>

  <div class="foot">این فاکتور توسط حساب‌یار صادر شده است — ${dateFa}</div>
</div>

<script>
  // چاپ خودکار بعد از لود کامل (فونت‌ها هم آماده باشند)
  window.addEventListener("load", function () {
    setTimeout(function () { try { window.print() } catch (e) {} }, 450)
  })
</script>
</body>
</html>`
}
