"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

/**
 * توست حساب‌یار (نسخهٔ ۳) — طراحی سفارشی:
 *  • آیکون در دایرهٔ رنگی + نوار رنگی کنار توست
 *  • شیشه‌ای (backdrop-blur) با سایهٔ نرم
 *  • موبایل: زیر هدر چسبان • دسکتاپ: بالای صفحه (در globals.css)
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group font-sans"
      dir="rtl"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "1.15rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-start",
          title: "font-sans text-start",
          description: "font-sans text-start",
          actionButton: "cn-toast-action",
          cancelButton: "cn-toast-cancel",
          closeButton: "cn-toast-x",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
