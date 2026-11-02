import { NextRequest } from "next/server"
import { z } from "zod"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { createPrintToken } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/print-token — توکن کوتاه‌عمر برای صفحهٔ چاپ
 * صفحهٔ چاپ در مرورگر خارج (تلگرام → openLink) باز می‌شود و کوکی ندارد؛
 * این توکن امضاشده ۱۰ دقیقه‌ای دسترسی چاپ می‌دهد.
 */
const printTokenSchema = z.object({
  resource: z.enum(["invoice", "person"], { message: "منبع چاپ نامعتبر است" }),
  id: z.string().min(1, "شناسهٔ رکورد لازم است"),
})

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, printTokenSchema)
    if (error) return error
    const token = createPrintToken(data.resource, data.id)
    return ok({ token, resource: data.resource, id: data.id })
  } catch (e) {
    return serverError(e)
  }
}
