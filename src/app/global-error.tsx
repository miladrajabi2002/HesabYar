"use client"

/**
 * Error Boundary سراسری — IMP-04 (خطاهای layout ریشه)
 */
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[hesabyar] خطای سراسری:", error)
  }, [error])

  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#f7f8fa",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: 320,
            background: "#fff",
            borderRadius: 24,
            border: "1px solid #eceef2",
            padding: 32,
            textAlign: "center",
            boxShadow: "0 6px 20px -4px rgba(16,24,40,0.08)",
          }}
        >
          <div style={{ fontSize: 28 }}>⚠️</div>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginTop: 12 }}>خطای غیرمنتظره</h2>
          <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.8, marginTop: 8 }}>
            داده‌های شما امن هستند. لطفاً دوباره تلاش کنید.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              width: "100%",
              height: 48,
              borderRadius: 16,
              border: "none",
              background: "#0e7c66",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            تلاش مجدد
          </button>
        </div>
      </body>
    </html>
  )
}
