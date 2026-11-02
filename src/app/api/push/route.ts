import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { getVapidPublicKey, saveSubscription, sendPushToAll } from "@/lib/web-push"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/push — کلید عمومی VAPID برای ثبت نوتیفیکیشن */
export async function GET() {
  const key = getVapidPublicKey()
  if (!key) return fail("نوتیفیکیشن وب هنوز روی سرور تنظیم نشده است", 503)
  return ok({ publicKey: key })
}

/** POST /api/push — ثبت اشتراک نوتیفیکیشن مرورگر (SEC-03) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const body = (await req.json().catch(() => null)) as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    } | null
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
      return fail("اطلاعات اشتراک نوتیفیکیشن ناقص است", 400)
    }
    await saveSubscription(
      { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
      req.headers.get("user-agent")
    )
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}

/** PUT /api/push — ارسال نوتیفیکیشن آزمایشی */
export async function PUT(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const r = await sendPushToAll({
      title: "✅ نوتیفیکیشن حساب‌یار فعال شد",
      body: "از این به بعد سررسید چک‌ها و هشدارها را همین‌جا دریافت می‌کنید.",
      tag: "TEST",
      url: "/",
    })
    if (r.sent === 0) return fail("هیچ دستگاهی برای نوتیفیکیشن ثبت نشده است", 400)
    return ok({ message: `به ${r.sent} دستگاه ارسال شد` })
  } catch (e) {
    return serverError(e)
  }
}

/** DELETE /api/push — حذف اشتراک */
export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null
    if (!body?.endpoint) return fail("endpoint الزامی است", 400)
    const { db } = await import("@/lib/db")
    await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } })
    return ok({ ok: true })
  } catch (e) {
    return serverError(e)
  }
}
