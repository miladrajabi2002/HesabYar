import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { settingsUpdateSchema } from "@/lib/validation"
import { resolveTelegramConfig, maskSecret } from "@/lib/telegram/config"

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
      lowBalanceDefault: cfg.lowBalanceDefault,
    })
  } catch (e) {
    return serverError(e)
  }
}

/** PUT /api/settings — ذخیره تنظیمات (مقادیر خالی یعنی بدون تغییر توکن/چت‌آیدی) */
export async function PUT(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, settingsUpdateSchema)
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
      update.miniAppUrl = (data.miniAppUrl ?? "").trim() || null
    }
    if (data.lowBalanceDefault !== undefined) {
      update.lowBalanceDefault = data.lowBalanceDefault
    }

    if (Object.keys(update).length > 0) {
      await db.setting.update({ where: { id: "default" }, data: update })
    }

    const cfg = await resolveTelegramConfig()
    return ok({
      ok: true,
      botTokenMasked: maskSecret(cfg.token),
      adminChatId: cfg.chatId,
      miniAppUrl: cfg.miniAppUrl ?? "",
      lowBalanceDefault: cfg.lowBalanceDefault,
    })
  } catch (e) {
    return serverError(e)
  }
}
