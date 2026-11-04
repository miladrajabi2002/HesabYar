"use client"

import { useState } from "react"

/**
 * آیا فرم از حالت شروعش تغییر کرده؟ (برای خاموش ماندن «ذخیره» تا وقتی چیزی عوض نشده)
 *
 * `resetKey` باید همان state ای باشد که فرم هم‌زمان با مقدارهای اولیه‌اش ست می‌کند
 * (الگوی `if (k !== key) { setKey(k); setF(...) }`) — نه prop ورودی؛ وگرنه عکس شروع از مقدارهای کهنه گرفته می‌شود.
 * هر بار resetKey عوض شود، مقدار همان لحظه شروع تازه است.
 */
export function useDirty(value: unknown, resetKey: unknown): boolean {
  const snap = JSON.stringify(value)
  const [base, setBase] = useState<{ key: unknown; snap: string }>({ key: resetKey, snap })
  if (!Object.is(base.key, resetKey)) {
    setBase({ key: resetKey, snap })
    return false
  }
  return base.snap !== snap
}
