import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { alertRuleUpdateSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** PATCH /api/alerts/[id] — فعال/غیرفعال یا تغییر حد */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const { data, error } = await parseBody(req, alertRuleUpdateSchema)
    if (error) return error

    const exists = await db.alertRule.findUnique({ where: { id } })
    if (!exists) return fail("قانون هشدار یافت نشد", 404)

    const rule = await db.alertRule.update({
      where: { id },
      data: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.threshold !== undefined ? { threshold: data.threshold ?? null } : {}),
        ...(data.accountId !== undefined ? { accountId: data.accountId ?? null } : {}),
      },
    })
    return ok({ rule })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/alerts/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { id } = await params
    const exists = await db.alertRule.findUnique({ where: { id } })
    if (!exists) return fail("قانون هشدار یافت نشد", 404)
    await db.alertRule.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
