/**
 * سرویس‌ورکر «حساب‌یار» — SEC-02 + SEC-03 + ADV-10
 *
 * استراتژی‌ها:
 *  - ناوبری (HTML): network-first + fallback به شل کش‌شده / offline.html
 *  - استاتیک (_next/static, icons, banks): stale-while-revalidate
 *  - API GET: فقط شبکه؛ در آفلاین پاسخ JSON خطای ساختاریافته
 *  - API POST فاکتور (ADV-10): در آفلاین داخل IndexedDB صف می‌شود (outbox)
 *    و با رویداد online/sync خودکار ارسال می‌شود
 *  - push: نمایش نوتیفیکیشن با کلیک → باز کردن صفحه مرتبط
 */

const VERSION = "hesabyar-v5"
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const DB_NAME = "hesabyar-outbox"
const OFFLINE_URL = "/offline.html"

// ───────── نصب ─────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((c) => c.addAll([OFFLINE_URL]).catch(() => null))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ───────── آفلاین: صف خروجی (outbox) با IndexedDB ─────────

function outboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("requests")) {
        db.createObjectStore("requests", { keyPath: "id", autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function outboxAdd(request) {
  const body = await request.clone().text()
  const db = await outboxDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("requests", "readwrite")
    tx.objectStore("requests").add({
      url: request.url,
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") || "application/json" },
      body,
      createdAt: Date.now(),
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function outboxAll() {
  const db = await outboxDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("requests", "readonly")
    const req = tx.objectStore("requests").getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function outboxDelete(id) {
  const db = await outboxDb()
  return new Promise((resolve) => {
    const tx = db.transaction("requests", "readwrite")
    tx.objectStore("requests").delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function flushOutbox() {
  const items = await outboxAll().catch(() => [])
  let sent = 0
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      })
      if (res.ok) {
        await outboxDelete(item.id)
        sent++
      }
    } catch {
      // هنوز آفلاین — بعداً دوباره
      break
    }
  }
  if (sent > 0) {
    const clientsArr = await self.clients.matchAll({ type: "window" })
    clientsArr.forEach((c) => c.postMessage({ type: "OUTBOX_SYNCED", count: sent }))
  }
  return sent
}

self.addEventListener("sync", (event) => {
  if (event.tag === "hesabyar-outbox") {
    event.waitUntil(flushOutbox())
  }
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OUTBOX") {
    event.waitUntil(flushOutbox())
  }
})

// ───────── fetch ─────────

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname.startsWith("/banks/") ||
  url.pathname === "/manifest.webmanifest" ||
  /\.(png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)

const isApi = (url) => url.pathname.startsWith("/api/")

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // API — بدون کش؛ POST فاکتور آفلاین صف می‌شود
  if (isApi(url)) {
    if (request.method === "POST" && url.pathname === "/api/invoices" && !navigator.onLine) {
      event.respondWith(
        outboxAdd(request)
          .then(async () => {
            // ثبت sync در صورت پشتیبانی
            if ("sync" in self.registration) {
              await self.registration.sync
                .register("hesabyar-outbox")
                .catch(() => null)
            }
            return new Response(
              JSON.stringify({ queuedOffline: true }),
              { status: 202, headers: { "content-type": "application/json" } }
            )
          })
          .catch(() => new Response(JSON.stringify({ error: "خطای آفلاین" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }))
      )
      return
    }
    // GET های API فقط از شبکه (داده مالی نباید کهنه شود)
    return
  }

  // استاتیک — stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // ناوبری — network-first با fallback شل/آفلاین
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy)).catch(() => null)
          return res
        })
        .catch(async () => {
          const cache = await caches.open(PAGE_CACHE)
          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response("آفلاین", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
          )
        })
    )
  }
})

// ───────── push (SEC-03) ─────────

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "حساب‌یار", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "حساب‌یار"
  const options = {
    body: data.body || "",
    tag: data.tag || "hesabyar",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "fa",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      // اگر پنجره باز است فوکوس کن و حرکت کن
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.focus()
          if ("navigate" in client && client.url !== self.location.origin + targetUrl) {
            client.navigate(targetUrl).catch(() => null)
          }
          return
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})

// با بازگشت آنلاین، صف را تخلیه کن
self.addEventListener("online", () => {
  flushOutbox().catch(() => null)
})
