import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { resolveTelegramConfig, maskSecret } from "@/lib/telegram/config"
import { settingsSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/** GET /api/settings — تنظیمات با مقادیر ماسک‌شده */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const cfg = await resolveTelegramConfig()
    const setting = await db.setting.findUnique({ where: { id: "default" } })
    return ok({
      botTokenMasked: maskSecret(cfg.token),
      hasBotToken: !!cfg.token,
      botTokenSource: setting?.botToken ? "db" : cfg.token ? "env" : null,
      adminChatId: cfg.chatId,
      hasAdminChatId: !!cfg.chatId,
      adminChatIdSource: setting?.adminChatId ? "db" : cfg.chatId ? "env" : null,
      miniAppUrl: cfg.miniAppUrl ?? "",
      miniAppUrlSource: setting?.miniAppUrl ? "db" : cfg.miniAppUrl ? "env" : null,
      checkDueDaysBefore: setting?.checkDueDaysBefore ?? 3,
    })
  } catch (e) {
    return serverError(e)
  }
}

/** PUT /api/settings — ذخیره تنظیمات (توکن/چت‌آیدی خالی یعنی بدون تغییر) */
export async function PUT(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, settingsSchema)
    if (error) return error

    await db.setting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })

    const update: Record<string, unknown> = {}
    if (typeof data.botToken === "string" && data.botToken.trim() !== "") {
      update.botToken = data.botToken.trim()
    }
    if (typeof data.adminChatId === "string" && data.adminChatId.trim() !== "") {
      update.adminChatId = data.adminChatId.trim()
    }
    if (data.miniAppUrl !== undefined) {
      update.miniAppUrl = data.miniAppUrl || null
    }
    if (data.checkDueDaysBefore !== undefined) {
      update.checkDueDaysBefore = data.checkDueDaysBefore
    }

    if (Object.keys(update).length > 0) {
      await db.setting.update({ where: { id: "default" }, data: update })
    }

    const cfg = await resolveTelegramConfig()
    const setting = await db.setting.findUnique({ where: { id: "default" } })
    return ok({
      ok: true,
      botTokenMasked: maskSecret(cfg.token),
      adminChatId: cfg.chatId,
      miniAppUrl: cfg.miniAppUrl ?? "",
      checkDueDaysBefore: setting?.checkDueDaysBefore ?? 3,
    })
  } catch (e) {
    return serverError(e)
  }
}
