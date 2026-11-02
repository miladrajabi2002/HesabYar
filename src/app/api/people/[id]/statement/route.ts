import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyPrintToken, extractCookie, SESSION_COOKIE, verifySessionToken } from "@/lib/auth"
import { formatToman, toPersianDigits } from "@/lib/money"
import { dayKeyToDate, endOfJalaliDay, formatJalali, formatJalaliWithWeekday, startOfJalaliDay } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { brandSvg } from "@/lib/brand"
import { buildStatement, type StatementRow } from "@/lib/statement"

export const dynamic = "force-dynamic"

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }

/**
 * GET /api/people/[id]/statement?t=TOKEN&from=1404-01-01&to=1404-12-29
 * صورتحساب شخص (دفتر بدهکار/بستانکار با ماندهٔ جاری) — صفحهٔ چاپ مستقل با لوگو؛
 * در مرورگر «ذخیره به PDF» یا چاپ. مجوز: توکن چاپ کوتاه‌عمر یا کوکی نشست.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sp = new URL(req.url).searchParams
    const authed =
      verifyPrintToken(sp.get("t"), "person", id) || verifySessionToken(extractCookie(req, SESSION_COOKIE))
    if (!authed) {
      return new NextResponse(
        `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>لینک منقضی شده</title><link rel="stylesheet" href="/fonts/print.css"><style>body{font-family:Vazirmatn,Tahoma,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f6f5;color:#334155}div{text-align:center;padding:2rem}h1{font-size:1.05rem}p{font-size:.85rem;color:#64748b}</style></head><body><div><h1>⛔ لینک صورتحساب معتبر نیست یا منقضی شده است</h1><p>از داخل حساب‌یار دوباره روی «صورتحساب PDF» بزنید.</p></div></body></html>`,
        { status: 401, headers: HTML }
      )
    }

    const person = await db.person.findUnique({ where: { id } })
    if (!person) return new NextResponse("شخص پیدا نشد", { status: 404, headers: HTML })

    const parseDay = (v: string | null) => (v && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) ? dayKeyToDate(v) : null)
    const fromDay = parseDay(sp.get("from"))
    const toDay = parseDay(sp.get("to"))
    const from = fromDay ? startOfJalaliDay(fromDay) : null
    const to = toDay ? endOfJalaliDay(toDay) : null

    const [invoices, settlements, checks] = await Promise.all([
      db.invoice.findMany({
        where: { personId: id },
        select: {
          id: true,
          number: true,
          type: true,
          date: true,
          total: true,
          paidCash: true,
          paidChecks: true,
          _count: { select: { items: true } },
        },
      }),
      db.settlement.findMany({
        where: { personId: id },
        select: {
          id: true,
          direction: true,
          method: true,
          amount: true,
          date: true,
          note: true,
          invoice: { select: { number: true } },
        },
      }),
      db.checkPaper.findMany({
        where: { personId: id, status: "PENDING" },
        orderBy: { dueDate: "asc" },
        select: { amount: true, bankKey: true, dueDate: true, serial: true, direction: true },
      }),
    ])

    const st = buildStatement({
      openingBalance: person.openingBalance,
      openingDate: person.createdAt,
      from,
      to,
      invoices: invoices.map((i) => ({ ...i, itemCount: i._count.items })),
      settlements: settlements.map((s) => ({
        ...s,
        // یادداشت فنی «(ref:…)» مازاد پرداخت در چاپ نشان داده نشود
        note: s.note?.replace(/\s*\(ref:[^)]*\)/, "") ?? null,
        invoiceNumber: s.invoice?.number ?? null,
      })),
    })

    return new NextResponse(renderStatement({ person, st, from, to, checks }), { headers: HTML })
  } catch {
    return new NextResponse("خطای سرور", { status: 500, headers: HTML })
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function faDigits(s: string): string {
  return toPersianDigits(s)
}

function balanceCell(n: number): string {
  if (n === 0) return `<span class="z">تسویه</span>`
  return `<b>${formatToman(Math.abs(n), false)}</b> <span class="tag ${n > 0 ? "dr" : "cr"}">${n > 0 ? "بد" : "بس"}</span>`
}

function renderStatement({
  person,
  st,
  from,
  to,
  checks,
}: {
  person: { name: string; phone: string | null; company: string | null; shopAddress: string | null }
  st: ReturnType<typeof buildStatement>
  from: Date | null
  to: Date | null
  checks: { amount: number; bankKey: string; dueDate: Date; serial: string; direction: string }[]
}): string {
  const today = formatJalaliWithWeekday(new Date())
  const range =
    from || to
      ? `از ${from ? formatJalali(from) : "ابتدا"} تا ${to ? formatJalali(to) : "امروز"}`
      : "از ابتدا تا امروز"
  const closing = st.closing
  const verdict =
    closing > 0
      ? { cls: "dr", title: "بدهکار", text: `«${esc(person.name)}» مبلغ زیر را بدهکار است` }
      : closing < 0
        ? { cls: "cr", title: "بستانکار", text: `«${esc(person.name)}» مبلغ زیر را طلبکار است` }
        : { cls: "ok", title: "تسویه", text: "حساب کاملاً تسویه است" }

  const rowHtml = (r: StatementRow, i: number) => `<tr class="${r.kind}">
  <td class="c n">${r.kind === "carry" ? "—" : faDigits(String(i))}</td>
  <td class="c n">${formatJalali(r.date)}</td>
  <td class="s"><b>${esc(faDigits(r.title))}</b>${r.detail ? `<div class="mut">${esc(faDigits(r.detail))}</div>` : ""}</td>
  <td class="e n">${r.debit ? formatToman(r.debit, false) : ""}</td>
  <td class="e n">${r.credit ? formatToman(r.credit, false) : ""}</td>
  <td class="e n">${balanceCell(r.balance)}</td>
</tr>`
  let idx = 0
  const rows = st.rows.map((r) => rowHtml(r, r.kind === "carry" ? 0 : ++idx)).join("\n")

  const checksHtml = checks.length
    ? `<h3 class="sec">چک‌های در جریان</h3>
<table class="mini">
<thead><tr><th>نوع</th><th>بانک</th><th>سریال</th><th>سررسید</th><th class="e">مبلغ (تومان)</th></tr></thead>
<tbody>${checks
        .map(
          (c) => `<tr><td>${c.direction === "RECEIVED" ? "دریافتی" : "صادره"}</td><td>${esc(getBank(c.bankKey).name)}</td><td class="n c">${esc(faDigits(c.serial || "—"))}</td><td class="n c">${formatJalali(c.dueDate)}</td><td class="e n"><b>${formatToman(c.amount, false)}</b></td></tr>`
        )
        .join("")}</tbody></table>`
    : ""

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>صورتحساب ${esc(person.name)}</title>
<link rel="stylesheet" href="/fonts/print.css">
<style>
  @page { size: A4; margin: 11mm 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; color: #0f1a17; background: #eef2f1; font-size: 11.5px;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 760px; margin: 0 auto 24px; background: #fff; padding: 22px 24px 28px; border-radius: 18px;
           box-shadow: 0 10px 40px -18px rgba(15,26,23,.25); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .brand .t1 { font-size: 19px; font-weight: 800; letter-spacing: -.3px; }
  .brand .t2 { font-size: 10px; color: #66726e; }
  .doc { text-align: left; }
  .doc .k { display: inline-block; background: #0b7a62; color: #fff; font-weight: 800; font-size: 12.5px; padding: 6px 14px; border-radius: 10px; }
  .doc .d { font-size: 10.5px; color: #66726e; margin-top: 6px; }
  .band { height: 4px; border-radius: 9px; margin: 14px 0 16px; background: linear-gradient(90deg, #f5a524 0 18%, #0b7a62 18% 100%); }
  .party { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; }
  .card { border: 1px solid #e3e9e7; border-radius: 14px; padding: 12px 14px; }
  .card h2 { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
  .card p { margin: 2px 0; color: #4a5753; }
  .sum { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .sum .lbl { font-size: 10.5px; color: #66726e; }
  .sum .amt { font-size: 21px; font-weight: 800; margin: 3px 0; letter-spacing: -.3px; }
  .sum .vd { display: inline-block; margin: 0 auto; font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .sum.dr { background: #fff6e5; border-color: #f6dca8; } .sum.dr .amt { color: #a15c00; } .sum.dr .vd { background: #f5a524; color: #fff; }
  .sum.cr { background: #eef6ff; border-color: #c9defa; } .sum.cr .amt { color: #1d5fbf; } .sum.cr .vd { background: #2f80ed; color: #fff; }
  .sum.ok { background: #eaf7f2; border-color: #bfe5d7; } .sum.ok .amt { color: #0b7a62; } .sum.ok .vd { background: #0b7a62; color: #fff; }
  .meta { display: flex; justify-content: space-between; color: #66726e; font-size: 10.5px; margin: 14px 2px 8px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .ledger th { background: #0f1a17; color: #fff; font-weight: 700; font-size: 10.5px; padding: 8px 7px; }
  .ledger th:first-child { border-radius: 0 10px 10px 0; } .ledger th:last-child { border-radius: 10px 0 0 10px; }
  .ledger td { padding: 7px; border-bottom: 1px solid #edf1ef; vertical-align: middle; }
  .ledger tr:nth-child(even) td { background: #fafcfb; }
  .ledger tr.carry td, .ledger tr.opening td { background: #f3f6f5; }
  .ledger tfoot td { font-weight: 800; background: #f0f5f3; border-top: 2px solid #0b7a62; border-bottom: 0; padding: 9px 7px; }
  .c { text-align: center; } .s { text-align: right; } .e { text-align: left; }
  .n { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mut { color: #7a8783; font-size: 10px; margin-top: 1px; }
  .tag { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 5px; }
  .tag.dr { background: #fff1d6; color: #a15c00; } .tag.cr { background: #e3efff; color: #1d5fbf; }
  .z { color: #0b7a62; font-weight: 700; font-size: 10px; }
  tr { page-break-inside: avoid; }
  .sec { font-size: 12px; margin: 18px 0 7px; color: #0b7a62; }
  .mini th { background: #f0f5f3; font-size: 10px; padding: 6px; font-weight: 700; }
  .mini td { padding: 6px; border-bottom: 1px dashed #e3e9e7; }
  .sign { display: flex; gap: 24px; margin-top: 34px; }
  .sign div { flex: 1; text-align: center; font-size: 10.5px; color: #4a5753; }
  .sign .line { border-top: 1.5px dashed #a7b2ae; margin-top: 30px; }
  .foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 20px; font-size: 9.5px; color: #8b9692; border-top: 1px solid #edf1ef; padding-top: 9px; }
  .printbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 10px;
    max-width: 760px; margin: 10px auto; padding: 10px 12px; background: #ffffffe6; backdrop-filter: blur(8px);
    border: 1px solid #dfe7e4; border-radius: 16px; font-size: 12px; color: #4a5753; }
  .printbar button { font-family: inherit; font-size: 13px; font-weight: 800; color: #fff; background: #0b7a62; border: 0;
    border-radius: 12px; padding: 10px 24px; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
    .printbar { display: none !important; }
  }
  @media (max-width: 600px) {
    .sheet { padding: 16px 12px; border-radius: 0; }
    .party { grid-template-columns: 1fr; }
    .ledger .hide-sm { display: none; }
    .head { flex-direction: column; align-items: stretch; } .doc { text-align: right; }
  }
</style>
</head>
<body>
<div class="printbar">
  <span>برای ذخیره PDF یا چاپ:</span>
  <button type="button" onclick="window.print()">⬇️ ذخیره PDF / چاپ</button>
</div>
<div class="sheet">
  <header class="head">
    <div class="brand">
      ${brandSvg(48, "st")}
      <div><div class="t1">حساب‌یار</div><div class="t2">دفتر حساب اشخاص</div></div>
    </div>
    <div class="doc"><span class="k">صورتحساب شخص</span><div class="d n">${esc(range)}</div></div>
  </header>
  <div class="band"></div>

  <section class="party">
    <div class="card">
      <h2>${esc(person.name)}</h2>
      ${person.company ? `<p>${esc(person.company)}</p>` : ""}
      ${person.phone ? `<p class="n">📞 ${esc(faDigits(person.phone))}</p>` : ""}
      ${person.shopAddress ? `<p>📍 ${esc(person.shopAddress)}</p>` : ""}
    </div>
    <div class="card sum ${verdict.cls}">
      <div class="lbl">${verdict.text}</div>
      <div class="amt n">${formatToman(Math.abs(closing))}</div>
      <span class="vd">${verdict.title}</span>
    </div>
  </section>

  <div class="meta"><span>تاریخ صدور: <span class="n">${today}</span></span><span>«بد» = بدهکار • «بس» = بستانکار</span></div>

  <table class="ledger">
    <thead><tr>
      <th style="width:30px">#</th><th style="width:78px">تاریخ</th><th class="s">شرح</th>
      <th class="e" style="width:96px">بدهکار</th><th class="e" style="width:96px">بستانکار</th><th class="e" style="width:118px">مانده</th>
    </tr></thead>
    <tbody>
      ${rows || `<tr><td colspan="6" class="c mut" style="padding:18px">در این بازه گردشی ثبت نشده است</td></tr>`}
    </tbody>
    <tfoot><tr>
      <td colspan="3" class="s">جمع گردش بازه</td>
      <td class="e n">${formatToman(st.totalDebit, false)}</td>
      <td class="e n">${formatToman(st.totalCredit, false)}</td>
      <td class="e n">${balanceCell(closing)}</td>
    </tr></tfoot>
  </table>

  ${checksHtml}

  <div class="sign">
    <div>مهر و امضای فروشگاه<div class="line"></div></div>
    <div>امضای ${esc(person.name)}<div class="line"></div></div>
  </div>
  <div class="foot">${brandSvg(14, "ft")} صادرشده با حساب‌یار — ${today}</div>
</div>
<script>
  window.addEventListener("load", function () {
    if (new URLSearchParams(location.search).get("print") === "1")
      setTimeout(function () { try { window.print() } catch (e) {} }, 500)
  })
</script>
</body>
</html>`
}
