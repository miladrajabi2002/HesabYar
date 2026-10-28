/**
 * کلاینت API — lib/api-client.ts
 * در مینی‌اپ تلگرام، هدر x-telegram-init-data به همه درخواست‌ها اضافه می‌شود.
 */

export class ApiError extends Error {
  status: number
  data: Record<string, unknown> | null
  constructor(message: string, status: number, data: Record<string, unknown> | null = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

function getInitData(): string | null {
  if (typeof window === "undefined") return null
  return window.Telegram?.WebApp?.initData || null
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  const initData = getInitData()
  if (initData) {
    headers.set("x-telegram-init-data", initData)
  }

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    const initData2 = getInitData()
    if (!initData2 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login"
    }
    let msg = "ابتدا وارد حساب‌یار شوید"
    let data401: Record<string, unknown> | null = null
    try {
      const j = await res.json()
      data401 = j
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, 401, data401)
  }

  if (!res.ok) {
    let msg = "خطای غیرمنتظره رخ داد"
    let data: Record<string, unknown> | null = null
    try {
      const j = await res.json()
      data = j
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status, data)
  }

  return (await res.json()) as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" })
}

export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: formData })
}
