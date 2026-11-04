import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/passkey/list — کلیدهای ثبت‌شده */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const keys = await db.passkey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        deviceName: true,
        credentialId: true,
        createdAt: true,
        lastUsedAt: true,
      },
    })
    return ok({ keys })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/passkey/list?id=… — حذف یک کلید */
export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return fail("شناسه کلید الزامی است", 400)
    await db.passkey.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e, "حذف کلید ناموفق بود")
  }
}
