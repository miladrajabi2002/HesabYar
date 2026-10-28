import type { Prisma } from "@prisma/client"

/** شکل یکنواخت پاسخ‌های تراکنش */
export const txInclude = {
  account: { select: { id: true, name: true, color: true, icon: true } },
  toAccount: { select: { id: true, name: true, color: true, icon: true } },
  category: { select: { id: true, name: true, color: true, icon: true, type: true } },
  recurringRule: { select: { id: true, title: true } },
} satisfies Prisma.TransactionInclude

export const debtTxInclude = {
  account: { select: { id: true, name: true, color: true, icon: true } },
  toAccount: { select: { id: true, name: true, color: true, icon: true } },
  category: { select: { id: true, name: true, color: true, icon: true, type: true } },
} satisfies Prisma.TransactionInclude
