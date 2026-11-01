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
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-muted/60 px-4 py-5">
            <span
              className={
                isDanger
                  ? "flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
                  : "flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              }
            >
              {state?.options.icon ??
                (isDanger ? <Trash2 className="size-6" /> : <AlertTriangle className="size-6" />)}
            </span>
          </div>
          <Button
            onClick={() => {
              setBusy(true)
              finish(true)
            }}
            disabled={busy}
            className={
              isDanger
                ? "h-12 w-full rounded-2xl bg-destructive font-bold hover:bg-destructive/90"
                : "h-12 w-full rounded-2xl font-bold"
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {state?.options.confirmText ?? "بله، انجام بده"}
          </Button>
          <Button
            onClick={() => finish(false)}
            disabled={busy}
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold"
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
