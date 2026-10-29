"use client"

/**
 * لوگوی بانک — فایل تکی ۱۲۸px شفاف (برش‌خورده و وسط‌چین) + نوار رنگ برند
 * منبع: iranianbanklogos (پردازش‌شده در scripts/gen_bank_logos.py)
 */
import { Landmark } from "lucide-react"
import { getBank, spriteKeyOf } from "@/lib/banks"
import { cn } from "@/lib/utils"

export function BankLogo({
  bankKey,
  size = 44,
  className,
  showBg = true,
}: {
  bankKey: string
  size?: number
  className?: string
  showBg?: boolean
}) {
  const bank = getBank(bankKey)

  // بانک «سایر» — کاشی خاکستری با آیکون
  if (bank.logoIndex < 0) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[30%] text-white",
          className
        )}
        style={{
          width: size,
          height: size,
          background: bank.color,
        }}
        aria-hidden
      >
        <Landmark style={{ width: size * 0.48, height: size * 0.48 }} />
      </span>
    )
  }

  const strip = Math.max(3, Math.round(size * 0.075))
  const logoSize = showBg ? Math.round(size * 0.78) : size

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        showBg &&
          "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] ring-1 ring-black/[0.08]",
        className
      )}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden
    >
      {/* نوار رنگ برند در پایین کاشی */}
      {showBg && (
        <span
          className="absolute inset-x-0 bottom-0"
          style={{ height: strip, background: bank.color }}
        />
      )}
      <img
        src={`/banks/logos/${spriteKeyOf(bank)}.png`}
        alt=""
        width={logoSize}
        height={logoSize}
        draggable={false}
        className="pointer-events-none select-none"
        style={{
          width: logoSize,
          height: logoSize,
          objectFit: "contain",
          marginBottom: showBg ? Math.round(strip * 0.55) : 0,
        }}
      />
    </span>
  )
}

/** نشان رنگی کوچک بانک (برای چک‌ها) */
export function BankDot({ bankKey, className }: { bankKey: string; className?: string }) {
  const bank = getBank(bankKey)
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: bank.color }}
      aria-hidden
    />
  )
}
