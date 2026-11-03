"use client"

/**
 * شیت تأیید یکدست (UI-05) — جایگزین confirm() بومی مرورگر
 * با همان زبان بصری باتم‌شیت اپ + هپتیک تلگرام.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useTelegram } from "@/hooks/use-telegram"

interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: "danger" | "primary"
  icon?: React.ReactNode
  /** نسخهٔ ۷: پیامدهای دقیق کار («۹ قلم به انبار برمی‌گردد») — به‌جای «مطمئنید؟» کلی */
  consequences?: React.ReactNode[]
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false })

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const [busy, setBusy] = useState(false)
  const { haptic } = useTelegram()

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        haptic.medium()
        setState({ options, resolve })
      }),
    [haptic]
  )

  const finish = useCallback(
    (result: boolean) => {
      state?.resolve(result)
      setState(null)
      setBusy(false)
      if (result) haptic.success()
      else haptic.tap()
    },
    [state, haptic]
  )

  const value = useMemo(() => ({ confirm }), [confirm])

  const tone = state?.options.tone ?? "danger"
  const isDanger = tone === "danger"

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <BottomSheet
        open={!!state}
        onClose={() => !busy && finish(false)}
        title={state?.options.title ?? ""}
        description={state?.options.description}
        desktopMode="dialog"
      >
        <div className="space-y-2.5">
          {state?.options.consequences?.length ? (
            <div className="rounded-2xl border border-border/80 px-4 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-label font-bold text-foreground/80">
                {state.options.icon ??
                  (isDanger ? (
                    <Trash2 className="size-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="size-4 text-primary" />
                  ))}
                با این کار:
              </p>
              <ul className="list-disc space-y-1 ps-5 text-sm leading-6 marker:text-muted-foreground">
                {state.options.consequences.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            onClick={() => {
              setBusy(true)
              finish(true)
            }}
            disabled={busy}
            className={
              isDanger
                ? "h-[3.25rem] w-full rounded-2xl bg-destructive text-body font-bold hover:bg-destructive/90"
                : "h-[3.25rem] w-full rounded-2xl text-body font-bold"
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {state?.options.confirmText ?? "بله، انجام بده"}
          </Button>
          <Button
            onClick={() => finish(false)}
            disabled={busy}
            variant="ghost"
            className="h-11 w-full rounded-2xl font-bold text-muted-foreground"
          >
            {state?.options.cancelText ?? "انصراف"}
          </Button>
        </div>
      </BottomSheet>
    </ConfirmContext.Provider>
  )
}

/** استفاده: const { confirm } = useConfirm(); if (await confirm({...})) { ... } */
export function useConfirm() {
  return useContext(ConfirmContext)
}
