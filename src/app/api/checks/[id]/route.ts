import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { checkPatchSchema } from "@/lib/validation"
import { checkInclude } from "@/lib/includes"
import { nowTehran } from "@/lib/jalali"
import { changeCheckStatus, type CheckStatus } from "@/lib/checks"

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

    // ───────── تغییر وضعیت (منطق مشترک با دکمه‌های تلگرام) ─────────
    const r = await changeCheckStatus(check.id, {
      status: data.status as CheckStatus,
      accountId: data.accountId,
      note: data.note,
    })
    if (!r.ok) return fail(r.error, r.code)

    const updated = await db.checkPaper.findUnique({ where: { id }, include: checkInclude })
    return ok({ check: updated })
  } catch (e) {
    return serverError(e)
  }
}
