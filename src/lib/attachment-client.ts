"use client"

/**
 * کلاینت پیوست‌های تصویری — lib/attachment-client.ts
 * آپلود/دانلود پیوست با هدر مینی‌اپ تلگرام (کوکی نشست در تلگرام وجود ندارد)
 * + هوک بارگذاری objectURL برای بندانگشتی‌های لیست (مثل عکس جنس)
 */

import { useEffect, useRef, useState } from "react"

/** پیوست — مطابق select در GET /api/attachments */
export interface Attachment {
  id: string
  filename: string
  mime: string
  size: number
}

/** آپلود پیوست با FormData — در مینی‌اپ تلگرام fetch خودکار JSON نمی‌گذارد */
export async function postAttachmentForm(url: string, fd: FormData): Promise<void> {
  const headers: Record<string, string> = {}
  const initData = window.Telegram?.WebApp?.initData
  if (initData) headers["x-telegram-init-data"] = initData
  const res = await fetch(url, { method: "POST", body: fd, headers })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || "آپلود پیوست ناموفق بود")
  }
}

/** دانلود پیوست به‌صورت blob — کوکی نشست در تلگرام نیست، هدر مینی‌اپ لازم است */
export async function fetchAttachmentObjectUrl(id: string): Promise<string> {
  const headers: Record<string, string> = {}
  const initData = window.Telegram?.WebApp?.initData
  if (initData) headers["x-telegram-init-data"] = initData
  const res = await fetch(`/api/attachments?id=${id}`, { headers })
  if (!res.ok) throw new Error("دریافت پیوست ناموفق بود")
  return URL.createObjectURL(await res.blob())
}

/**
 * هوک بارگذاری تصویر چند پیوست — نقشهٔ id → objectURL
 * برای بندانگشتی‌های لیست (فهرست اجناس، انتخاب جنس در فاکتور و…)
 */
export function useAttachmentUrls(ids: string[]): Record<string, string> {
  const key = ids.join("|")
  const [urls, setUrls] = useState<Record<string, string>>({})
  const cacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const list = key ? key.split("|") : []
    let cancelled = false
    ;(async () => {
      for (const id of list) {
        if (cacheRef.current.has(id)) continue
        try {
          const url = await fetchAttachmentObjectUrl(id)
          if (cancelled) {
            URL.revokeObjectURL(url)
          } else {
            cacheRef.current.set(id, url)
            setUrls((prev) => (prev[id] === url ? prev : { ...prev, [id]: url }))
          }
        } catch {
          /* دانلود این پیوست ناموفق بود — جای اسکلت لودینگ می‌ماند */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  /** آزادسازی همهٔ objectURL ها هنگام ترک صفحه */
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      cache.forEach((u) => URL.revokeObjectURL(u))
      cache.clear()
    }
  }, [])

  return urls
}
