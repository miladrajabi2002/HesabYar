import { NextRequest } from "next/server"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { processRecurringRules } from "@/lib/recurring"

export const dynamic = "force-dynamic"

/**
 * POST /api/recurring/run — پردازش دستی
 * بدون بدنه: پردازش همه قواعد سررسیدشده (catch-up)
 * با { ruleId }: اجرای فوری همان قاعده
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    let ruleId: string | undefined
    try {
      const body = (await req.json()) as { ruleId?: string }
      ruleId = body?.ruleId
    } catch {
      ruleId = undefined
    }

    if (ruleId) {
      const result = await processRecurringRules({ ruleId, force: true })
      return ok({ ...result, message: "قاعده با موفقیت اجرا شد و تراکنش ثبت شد" })
    }

    const result = await processRecurringRules()
    return ok({
      ...result,
      message: result.created > 0 ? `${result.created} تراکنش تکرارشونده ثبت شد` : "هیچ قاعده سررسیدشده‌ای وجود ندارد",
    })
  } catch (e) {
    return serverError(e)
  }
}
