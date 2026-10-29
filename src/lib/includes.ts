import type { Prisma } from "@prisma/client"

/** شکل یکنواخت پاسخ فاکتور (با اقلام و چک‌ها) */
export const invoiceInclude = {
  person: { select: { id: true, name: true, phone: true, company: true, role: true } },
  account: { select: { id: true, name: true, bankKey: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, brand: true, code: true, unit: true } },
    },
  },
  checks: true,
  settlements: true,
} satisfies Prisma.InvoiceInclude

/** شکل پاسخ چک */
export const checkInclude = {
  person: { select: { id: true, name: true, phone: true } },
  invoice: { select: { id: true, number: true, type: true } },
  account: { select: { id: true, name: true, bankKey: true } },
} satisfies Prisma.CheckPaperInclude

/** شکل پاسخ تسویه */
export const settlementInclude = {
  person: { select: { id: true, name: true } },
  account: { select: { id: true, name: true, bankKey: true } },
  invoice: { select: { id: true, number: true, type: true } },
} satisfies Prisma.SettlementInclude
