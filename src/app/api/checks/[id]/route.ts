import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { checkPatchSchema } from "@/lib/validation"
import { checkInclude } from "@/lib/includes"
import { nowTehran } from "@/lib/jalali"
import { recomputeInvoice } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/checks/[id] — جزئیات چک */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const check = await db.checkPaper.findUnique({ where: { id }, include: checkInclude })
    if (!check) return fail("چک پیدا نشد", 404)
    return ok({ check })
  } catch (e) {
    return serverError(e)
  }
}

/**
 * PATCH /api/checks/[id] — دو عمل:
 *  ۱) action=register → ثبت چک به نام (چک دریافتی به نام ما، صادره به نام مشتری)
 *  ۲) تغییر وضعیت: CASHED (پاس) / BOUNCED (برگشت) / CANCELED (لغو) / PENDING (بازگشت از لغو)
 *  قاعده: چکِ ثبت‌نشده قابل پاس/برگشت/لغو نیست — اول باید ثبت شود.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await ctx.params
    const { data, error } = await parseBody(req, checkPatchSchema)
    if (error) return error

    const check = await db.checkPaper.findUnique({ where: { id }, include: { person: true } })
    if (!check) return fail("چک پیدا نشد", 404)

    // ───────── ثبت چک به نام ─────────
    if (data.action === "register") {
      if (check.status !== "PENDING") {
        return fail("فقط چک در جریان قابل ثبت است", 400)
      }
      if (data.isRegistered) {
        if (!data.registeredName) return fail("نام صاحب حساب را وارد کنید", 400)
        await db.checkPaper.update({
          where: { id: check.id },
          data: {
            isRegistered: true,
            registeredName: data.registeredName,
            registeredNationalId: data.registeredNationalId ?? null,
            registeredAt: nowTehran(),
          },
        })
      } else {
        // برگرداندن به حالت ثبت‌نشده (ادیت اشتباه)
        await db.checkPaper.update({
          where: { id: check.id },
          data: {
            isRegistered: false,
            registeredName: null,
            registeredNationalId: null,
            registeredAt: null,
          },
        })
      }
      const updated = await db.checkPaper.findUnique({ where: { id }, include: checkInclude })
      return ok({ check: updated })
    }

    // ───────── تغییر وضعیت ─────────
    if (check.status === data.status) return fail("چک هم‌اکنون در این وضعیت است", 400)
    if (check.status === "CASHED" && data.status !== "CASHED") {
      return fail("چک پاس‌شده قابل تغییر نیست", 400)
    }

    // قاعده کسب‌وکار: چک ثبت‌نشده پاس/برگشت/لغو نمی‌شود
    if (
      !check.isRegistered &&
      (data.status === "CASHED" || data.status === "BOUNCED" || data.status === "CANCELED")
    ) {
      const who = check.direction === "RECEIVED" ? "به نام شما" : "به نام مشتری"
      return fail(
        `این چک هنوز ثبت نشده است — اول چک را ${who} ثبت کنید، بعد پاس/برگشت/لغو امکان‌پذیر است`,
        400
      )
    }

    // ───────── پاس شدن چک ─────────
    if (data.status === "CASHED") {
      if (!data.accountId) return fail("حساب محل پاس چک را انتخاب کنید", 400)
      const account = await db.account.findFirst({ where: { id: data.accountId, isArchived: false } })
      if (!account) return fail("حساب بانکی پیدا نشد", 404)

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
          data: { status: "CASHED", accountId: account.id, note: data.note ?? check.note },
        })
      })
    }

    // ───────── برگشت چک ─────────
    else if (data.status === "BOUNCED") {
      await db.$transaction(async (tx) => {
        // اگر چک بابت فاکتور است: مانده فاکتور برمی‌گردد (در recompute با تغییر status)
        // اگر چک بابت تسویه است: تسویه حذف می‌شود تا تراز شخص درست بماند
        if (check.settlementId) {
          const st = await tx.settlement.findUnique({ where: { id: check.settlementId } })
          if (st) {
            if (st.method === "CASH") {
              await tx.transaction.deleteMany({ where: { type: "SETTLEMENT_CASH", refId: st.id } }).catch(() => null)
            }
            await tx.settlement.delete({ where: { id: st.id } }).catch(() => null)
          }
        }
        // گردش پاس قبلی (اگر اشتباهاً پاس شده بود و حالا برگشت) حذف می‌شود
        if (check.status === "CASHED") {
          await tx.transaction.deleteMany({ where: { type: "CHECK_CASHED", refId: check.id } }).catch(() => null)
        }
        await tx.checkPaper.update({
          where: { id: check.id },
          data: { status: "BOUNCED", accountId: null, note: data.note ?? check.note },
        })
      })
      if (check.invoiceId) await recomputeInvoice(check.invoiceId)
    }

    // ───────── لغو چک ─────────
    else if (data.status === "CANCELED") {
      await db.$transaction(async (tx) => {
        if (check.settlementId) {
          const st = await tx.settlement.findUnique({ where: { id: check.settlementId } })
          if (st) {
            await tx.settlement.delete({ where: { id: st.id } }).catch(() => null)
          }
        }
        if (check.status === "CASHED") {
          await tx.transaction.deleteMany({ where: { type: "CHECK_CASHED", refId: check.id } }).catch(() => null)
        }
        await tx.checkPaper.update({
          where: { id: check.id },
          data: { status: "CANCELED", accountId: null, note: data.note ?? check.note },
        })
      })
      if (check.invoiceId) await recomputeInvoice(check.invoiceId)
    }

    // ───────── بازگشت به در جریان (فقط از لغو و فقط چک‌های بابت فاکتور) ─────────
    else if (data.status === "PENDING") {
      if (check.status !== "CANCELED") return fail("فقط چک لغوشده قابل بازگشت است", 400)
      if (check.settlementId) {
        return fail("چکِ بابت تسویه قابل بازگشت نیست؛ تسویه جدید ثبت کنید", 400)
      }
      await db.checkPaper.update({ where: { id: check.id }, data: { status: "PENDING" } })
      if (check.invoiceId) await recomputeInvoice(check.invoiceId)
    }

    const updated = await db.checkPaper.findUnique({ where: { id }, include: checkInclude })
    return ok({ check: updated })
  } catch (e) {
    return serverError(e)
  }
}
