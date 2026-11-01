import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { buildRegistrationOptions, verifyRegistrationResponseWrapper } from "@/lib/passkey"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/passkey/register?device=آیفون — گزینه‌های ثبت کلید جدید (SEC-01) */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const device = new URL(req.url).searchParams.get("device")?.trim() || undefined
    const options = await buildRegistrationOptions(req, device)
    return ok({ options })
  } catch (e) {
    return serverError(e, "ساخت درخواست ثبت کلید ناموفق بود")
  }
}

/** POST /api/passkey/register — تأیید و ذخیره کلید جدید */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const body = (await req.json().catch(() => null)) as {
      credential?: Record<string, unknown>
      deviceName?: string
    } | null
    if (!body?.credential) return fail("پاسخ کلید ارسال نشده است", 400)

    const verification = await verifyRegistrationResponseWrapper(req, body.credential)
    if (!verification.verified || !verification.registrationInfo) {
      return fail("تأیید کلید ناموفق بود — دوباره تلاش کنید", 400)
    }
    const info = verification.registrationInfo
    await db.passkey.create({
      data: {
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey).toString("base64"),
        counter: info.credential.counter,
        transports: info.credential.transports?.join(",") ?? null,
        deviceName: body.deviceName?.trim() || "دستگاه من",
      },
    })
    return ok({ ok: true, message: "کلید با موفقیت ثبت شد — حالا می‌توانید با اثر انگشت/چهره وارد شوید" })
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : "ثبت کلید ناموفق بود",
      400
    )
  }
}
