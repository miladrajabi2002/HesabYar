/**
 * منطق مشترک حذف تسویه — هم از مسیر /api/settlements/[id] و هم از حذف گردش بانکی استفاده می‌شود.
 * حذف تسویه یعنی: گردش بانکی‌اش، چک‌های بابتش (با گردش پاس و پیوست تصویری) و خودش پاک می‌شود
 * و مانده‌ی فاکتور مرتبط دوباره محاسبه می‌گردد.
 */
import fs from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"
import { recomputeInvoice, getPersonBalance } from "@/lib/finance"
import { uploadsDir } from "@/lib/storage"

export async function deleteSettlementFull(
  id: string
): Promise<{ personId: string; invoiceId: string | null; balance: number } | null> {
  const settlement = await db.settlement.findUnique({ where: { id } })
  if (!settlement) return null

  const orphanFiles: string[] = []

  await db.$transaction(async (tx) => {
    const checks = await tx.checkPaper.findMany({ where: { settlementId: id }, select: { id: true } })
    const checkIds = checks.map((c) => c.id)

    if (checkIds.length > 0) {
      await tx.transaction.deleteMany({ where: { type: "CHECK_CASHED", refId: { in: checkIds } } })
      const atts = await tx.attachment.findMany({
        where: { refType: "CHECK", refId: { in: checkIds } },
        select: { id: true },
      })
      if (atts.length > 0) {
        await tx.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } })
        orphanFiles.push(...atts.map((a) => a.id))
      }
      await tx.checkPaper.deleteMany({ where: { id: { in: checkIds } } })
    }

    await tx.transaction.deleteMany({ where: { type: "SETTLEMENT_CASH", refId: id } })
    await tx.settlement.delete({ where: { id } })
  })

  // پاک‌سازی فایل‌های پیوست (خارج از تراکنش — خطایش بحرانی نیست)
  for (const attId of orphanFiles) {
    try {
      fs.unlinkSync(path.join(uploadsDir(), attId))
    } catch {
      /* فایل از قبل نبود */
    }
  }

  if (settlement.invoiceId) await recomputeInvoice(settlement.invoiceId)
  const balance = await getPersonBalance(settlement.personId)
  return { personId: settlement.personId, invoiceId: settlement.invoiceId, balance }
}
