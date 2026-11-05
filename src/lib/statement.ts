/**
 * دفتر صورتحساب شخص — lib/statement.ts (خالص، بدون دیتابیس)
 * ردیف‌های زمانی بدهکار/بستانکار با ماندهٔ جاری؛ قرارداد علامت مثل تراز شخص:
 *   مثبت = شخص بدهکار است (طلب ما) • منفی = شخص بستانکار است (بدهی ما)
 *
 *  فاکتور فروش  → بدهکار (مبلغ نهایی)   | پرداخت همان فاکتور (نقد+چک، تا سقف مبلغ) → بستانکار
 *  فاکتور خرید  → بستانکار (مبلغ نهایی) | پرداخت ما (نقد+چک، تا سقف مبلغ)           → بدهکار
 *  تسویهٔ دریافت → بستانکار • تسویهٔ پرداخت → بدهکار (مازاد پرداخت هم به‌صورت تسویهٔ آزاد ثبت شده)
 * با این قواعد ماندهٔ پایانی برابر personBalance در finance-math است.
 */

export interface StatementInvoice {
  id: string
  number: number
  type: string
  date: Date
  total: number
  paidCash: number
  paidChecks: number
  itemCount: number
}

export interface StatementSettlement {
  id: string
  direction: string
  method: string
  amount: number
  date: Date
  invoiceNumber?: number | null
  note?: string | null
}

export interface StatementRow {
  date: Date
  title: string
  detail?: string
  debit: number
  credit: number
  balance: number
  kind: "opening" | "invoice" | "payment" | "settlement" | "carry"
  /** رکورد منبع ردیف — برای باز کردن فاکتور/تسویه از دفتر داخل اپ */
  ref?: { type: "invoice" | "settlement"; id: string }
}

export function buildStatement(input: {
  openingBalance: number
  invoices: StatementInvoice[]
  settlements: StatementSettlement[]
  /** فقط ردیف‌های بعد از این تاریخ جدا نشان داده شوند؛ قبلی‌ها در «مانده از قبل» جمع می‌شوند */
  from?: Date | null
  to?: Date | null
  /** تاریخ ردیف مانده اولیه (معمولاً تاریخ ساخت شخص) */
  openingDate: Date
}): { rows: StatementRow[]; totalDebit: number; totalCredit: number; closing: number } {
  type Entry = Omit<StatementRow, "balance">
  const entries: Entry[] = []

  if (input.openingBalance) {
    entries.push({
      date: input.openingDate,
      title: "مانده اولیه (حساب قبلی)",
      debit: Math.max(0, input.openingBalance),
      credit: Math.max(0, -input.openingBalance),
      kind: "opening",
    })
  }

  for (const inv of input.invoices) {
    const sale = inv.type === "SALE"
    const label = `${sale ? "فاکتور فروش" : "فاکتور خرید"} ${inv.number}`
    entries.push({
      date: inv.date,
      title: label,
      detail: inv.itemCount ? `${inv.itemCount} قلم` : undefined,
      debit: sale ? inv.total : 0,
      credit: sale ? 0 : inv.total,
      kind: "invoice",
      ref: { type: "invoice", id: inv.id },
    })
    const paidAtInvoice = Math.min(inv.total, inv.paidCash + inv.paidChecks)
    if (paidAtInvoice > 0) {
      const how = [inv.paidCash > 0 ? "نقد" : null, inv.paidChecks > 0 ? "چک" : null].filter(Boolean).join(" + ")
      entries.push({
        date: inv.date,
        title: sale ? `دریافت بابت فاکتور ${inv.number}` : `پرداخت بابت فاکتور ${inv.number}`,
        detail: how,
        debit: sale ? 0 : paidAtInvoice,
        credit: sale ? paidAtInvoice : 0,
        kind: "payment",
        ref: { type: "invoice", id: inv.id },
      })
    }
  }

  for (const st of input.settlements) {
    const receive = st.direction === "RECEIVE"
    entries.push({
      date: st.date,
      title: receive ? "دریافت از شخص" : "پرداخت به شخص",
      detail: [st.method === "CHECK" ? "چک" : "نقد", st.invoiceNumber ? `بابت فاکتور ${st.invoiceNumber}` : null, st.note]
        .filter(Boolean)
        .join(" • "),
      debit: receive ? 0 : st.amount,
      credit: receive ? st.amount : 0,
      kind: "settlement",
      ref: { type: "settlement", id: st.id },
    })
  }

  // ترتیب زمانی پایدار: در یک روز، مانده اولیه ← فاکتور ← پرداخت همان فاکتور ← تسویه
  const order = { opening: 0, carry: 0, invoice: 1, payment: 2, settlement: 3 }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || order[a.kind] - order[b.kind])

  const rows: StatementRow[] = []
  let running = 0
  let carried = false
  let totalDebit = 0
  let totalCredit = 0
  for (const e of entries) {
    if (input.to && e.date.getTime() > input.to.getTime()) continue
    running += e.debit - e.credit
    if (input.from && e.date.getTime() < input.from.getTime()) {
      carried = true
      continue
    }
    if (carried) {
      // اولین ردیف داخل بازه: مانده از قبل
      const before = running - (e.debit - e.credit)
      rows.push({ date: input.from!, title: "مانده از قبل", debit: 0, credit: 0, balance: before, kind: "carry" })
      carried = false
    }
    totalDebit += e.debit
    totalCredit += e.credit
    rows.push({ ...e, balance: running })
  }
  if (carried) {
    rows.push({ date: input.from!, title: "مانده از قبل", debit: 0, credit: 0, balance: running, kind: "carry" })
  }
  return { rows, totalDebit, totalCredit, closing: running }
}
