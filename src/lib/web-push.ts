/**
 * Web Push — lib/web-push.ts (SEC-03)
 * ارسال نوتیفیکیشن وب به همه اشتراک‌های ثبت‌شده با کلیدهای VAPID.
 */
import webpush from "web-push"
import { db } from "./db"

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@hesabyar.miladrajabi.com",
    pub,
    priv
  )
  configured = true
  return true
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

/** ارسال پوش به همه اشتراک‌ها — اشتراک‌های مرده خودکار پاک می‌شوند */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0 }
  const subs = await db.pushSubscription.findMany().catch(() => [])
  let sent = 0
  let removed = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 24 * 3600, urgency: "high" }
        )
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // ۴۰۴/۴۱۰ = اشتراک دیگر معتبر نیست
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null)
          removed++
        }
      }
    })
  )
  return { sent, removed }
}

/** ثبت/به‌روزرسانی اشتراک جدید */
export async function saveSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null
): Promise<void> {
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...(userAgent ? { userAgent } : {}) },
    create: {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
  })
}
