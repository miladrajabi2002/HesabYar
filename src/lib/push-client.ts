"use client"

/**
 * کلاینت Web Push — ثبت اشتراک اعلان مرورگر (الگوی app، برگرفته از تنظیمات حساب‌یار)
 * iOS فقط در حالت نصب‌شده روی صفحهٔ اصلی (۱۶٫۴+) اجازهٔ Push می‌دهد.
 * همین ماژول توسط کارت پیشنهاد PWA و صفحهٔ تنظیمات قابل استفاده است.
 */
import { apiGet, apiPost } from "@/lib/api-client"

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushCapable(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window && "PushManager" in window
}

export function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
}

async function ready(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await ready()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush(): Promise<void> {
  if (!pushCapable()) throw new Error(isIOS() && !isStandalone() ? "در آیفون اول اپ را «Add to Home Screen» کن و از آیکونش باز کن" : "این مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند")
  const perm = await Notification.requestPermission()
  if (perm !== "granted") throw new Error("اجازهٔ نوتیفیکیشن داده نشد؛ از تنظیمات گوشی فعالش کن")
  const { publicKey } = await apiGet<{ publicKey: string }>("/api/push")
  const reg = await ready()
  if (!reg) throw new Error("سرویس‌ورکر آماده نشد؛ صفحه را یک بار تازه کن")
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("اشتراک ناقص است")
  await apiPost("/api/push", { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null)
  await sub.unsubscribe()
}
