import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// مقیاس متن نام‌دار (globals.css → @theme): بدون این، tailwind-merge «text-caption» را رنگ می‌پندارد
// و کنار «text-muted-foreground» یکی از آن دو را حذف می‌کند
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["micro", "caption", "label", "body", "title", "page", "display"] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
