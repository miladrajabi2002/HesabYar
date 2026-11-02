/**
 * تغییر وضعیت چک — lib/checks.ts
 * منطق مشترک «پاس / برگشت / لغو / بازگشت به جریان» که هم API (PATCH /api/checks/[id])
 * و هم دکمه‌های داخل تلگرام (یادآوری صبحگاهی) از آن استفاده می‌کنند.
 */
import { db } from "@/lib/db"
import { nowTehran } from "@/lib/jalali"
import { recomputeInvoice } from "@/lib/finance"

export type CheckStatus = "PENDING" | "CASHED" | "BOUNCED" | "CANCELED"

export type CheckStatusResult = { ok: true } | { ok: false; error: string; code: number }

export async function changeCheckStatus(
  id: string,
  input: { status: CheckStatus; accountId?: string | null; note?: string | null }
): Promise<CheckStatusResult> {
  const check = await db.checkPaper.findUnique({ where: { id }, include: { person: true } })
  if (!check) return { ok: false, error: "چک پیدا نشد", code: 404 }
  const { status } = input
  const note = input.note ?? check.note

  if (check.status === status) return { ok: false, error: "چک هم‌اکنون در این وضعیت است", code: 400 }
  if (check.status === "CASHED" && status !== "CASHED") {
    return { ok: false, error: "چک پاس‌شده قابل تغییر نیست", code: 400 }
  }

  // قاعده کسب‌وکار: چک ثبت‌نشده پاس/برگشت/لغو نمی‌شود
  if (!check.isRegistered && (status === "CASHED" || status === "BOUNCED" || status === "CANCELED")) {
    const who = check.direction === "RECEIVED" ? "به نام شما" : "به نام مشتری"
    return {
      ok: false,
      error: `این چک هنوز ثبت نشده است — اول چک را ${who} ثبت کنید، بعد پاس/برگشت/لغو امکان‌پذیر است`,
      code: 400,
    }
  }

  // ───────── پاس شدن چک ─────────
  if (status === "CASHED") {
    if (!input.accountId) return { ok: false, error: "حساب محل پاس چک را انتخاب کنید", code: 400 }
    const account = await db.account.findFirst({ where: { id: input.accountId, isArchived: false } })
    if (!account) return { ok: false, error: "حساب بانکی پیدا نشد", code: 404 }

    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          accountId: account.id,
          direction: check.direction === "RECEIVED" ? "IN" : "OUT",
          amount: check.amount,
          type: "CHECK_CASHED",
          refId: check.id,
          description:
            check.direction === "RECEIVED"
              ? `پاس چک «${check.person.name}»`
              : `برداشت سررسید چک صادره «${check.person.name}»`,
          date: nowTehran(),
        },
      })
      await tx.checkPaper.update({
        where: { id: check.id },
        data: { status: "CASHED", accountId: account.id, note },
      })
    })
    return { ok: true }
  }

  // ───────── برگشت / لغو ─────────
  if (status === "BOUNCED" || status === "CANCELED") {
    await db.$transaction(async (tx) => {
      // اگر چک بابت فاکتور است: مانده فاکتور برمی‌گردد (در recompute با تغییر status)
      // اگر چک بابت تسویه است: تسویه حذف می‌شود تا تراز شخص درست بماند
      if (check.settlementId) {
        const st = await tx.settlement.findUnique({ where: { id: check.settlementId } })
        if (st) {
          if (status === "BOUNCED" && st.method === "CASH") {
            await tx.transaction.deleteMany({ where: { type: "SETTLEMENT_CASH", refId: st.id } }).catch(() => null)
          }
          await tx.settlement.delete({ where: { id: st.id } }).catch(() => null)
        }
      }
      // گردش پاس قبلی (اگر اشتباهاً پاس شده بود) حذف می‌شود
      if (check.status === "CASHED") {
        await tx.transaction.deleteMany({ where: { type: "CHECK_CASHED", refId: check.id } }).catch(() => null)
      }
      await tx.checkPaper.update({
        where: { id: check.id },
        data: { status, accountId: null, note },
      })
    })
    if (check.invoiceId) await recomputeInvoice(check.invoiceId)
    return { ok: true }
  }

  // ───────── بازگشت به در جریان (فقط از لغو و فقط چک‌های بابت فاکتور) ─────────
  if (check.status !== "CANCELED") return { ok: false, error: "فقط چک لغوشده قابل بازگشت است", code: 400 }
  if (check.settlementId) {
    return { ok: false, error: "چکِ بابت تسویه قابل بازگشت نیست؛ تسویه جدید ثبت کنید", code: 400 }
  }
  await db.checkPaper.update({ where: { id: check.id }, data: { status: "PENDING" } })
  if (check.invoiceId) await recomputeInvoice(check.invoiceId)
  return { ok: true }
}
