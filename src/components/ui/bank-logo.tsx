"use client"

/**
 * لوگوی بانک — اسپریت رسمی iranianbanklogos + رنگ برند خودکار
 */
import { getBank, spritePosition, spriteUrl } from "@/lib/banks"
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

  if (bank.logoIndex < 0) {
    // بانک سایر — نشان حرف‌دار
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl font-bold text-white",
          className
        )}
        style={{
          width: size,
          height: size,
          background: bank.color,
          fontSize: size * 0.34,
        }}
      >
        ؟
      </span>
    )
  }

  const px = size <= 24 ? 32 : size <= 48 ? 64 : 128
  const scale = px / size
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        showBg && "bg-white",
        className
      )}
      style={{
        width: size,
        height: size,
        boxShadow: showBg ? `inset 0 0 0 1.5px ${bank.color}33, inset 0 -3px 0 ${bank.color}` : undefined,
      }}
      aria-hidden
    >
      <span
        className="block bg-no-repeat"
        style={{
          width: px,
          height: px,
          transform: `scale(${1 / scale})`,
          transformOrigin: "top left",
          backgroundImage: `url(${spriteUrl(size)})`,
          backgroundPosition: spritePosition(bank.logoIndex, size),
          backgroundSize: `${px * 5}px auto`,
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
