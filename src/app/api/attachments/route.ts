import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { ok, fail, requireApiAuth, serverError } from "@/lib/api-helpers"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** پوشه ذخیره پیوست‌ها — خارج از public و سرو از طریق API */
function uploadsDir(): string {
  const dir = path.join(process.cwd(), "uploads")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const MAX_SIZE = 8 * 1024 * 1024 // ۸ مگابایت
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

/** GET /api/attachments?refType=CHECK&refId=… — لیست پیوست‌های یک رکورد */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    // دانلود خود فایل
    if (id) {
      const att = await db.attachment.findUnique({ where: { id } })
      if (!att) return fail("پیوست پیدا نشد", 404)
      const filePath = path.join(uploadsDir(), att.id)
      if (!fs.existsSync(filePath)) return fail("فایل پیوست یافت نشد", 404)
      const buf = fs.readFileSync(filePath)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "content-type": att.mime,
          "content-disposition": `inline; filename="${encodeURIComponent(att.filename)}"`,
          "cache-control": "private, max-age=86400",
        },
      })
    }
    const refType = url.searchParams.get("refType")
    const refId = url.searchParams.get("refId")
    if (!refType || !refId) return fail("refType و refId الزامی است", 400)
    const attachments = await db.attachment.findMany({
      where: { refType, refId },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, mime: true, size: true, createdAt: true },
    })
    return ok({ attachments })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/attachments — آپلود پیوست تصویر (ADV-04) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const formData = await req.formData().catch(() => null)
    if (!formData) return fail("فایل ارسال نشده است", 400)
    const file = formData.get("file")
    const refType = formData.get("refType")
    const refId = formData.get("refId")
    if (!(file instanceof File) || typeof refType !== "string" || typeof refId !== "string") {
      return fail("فایل و مشخصات رکورد الزامی است", 400)
    }
    if (!["CHECK", "INVOICE", "PERSON"].includes(refType)) {
      return fail("نوع پیوست نامعتبر است", 400)
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return fail("فقط تصویر (JPG/PNG/WebP) یا PDF مجاز است", 400)
    }
    if (file.size > MAX_SIZE) return fail("حجم فایل بیش از ۸ مگابایت است", 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    const att = await db.attachment.create({
      data: {
        refType,
        refId,
        filename: file.name || "پیوست",
        mime: file.type,
        size: file.size,
      },
    })
    fs.writeFileSync(path.join(uploadsDir(), att.id), buffer)
    return ok({ attachment: { id: att.id, filename: att.filename, mime: att.mime, size: att.size, createdAt: att.createdAt } })
  } catch (e) {
    return serverError(e, "آپلود پیوست ناموفق بود")
  }
}

/** DELETE /api/attachments?id=… — حذف پیوست */
export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return fail("شناسه پیوست الزامی است", 400)
    const att = await db.attachment.findUnique({ where: { id } })
    if (!att) return fail("پیوست پیدا نشد", 404)
    await db.attachment.delete({ where: { id } })
    try {
      fs.unlinkSync(path.join(uploadsDir(), att.id))
    } catch {
      /* ignore */
    }
    return ok({ ok: true })
  } catch (e) {
    return serverError(e, "حذف پیوست ناموفق بود")
  }
}
