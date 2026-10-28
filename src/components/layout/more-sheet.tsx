"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useUIStore } from "@/lib/ui-store"
import { NAV_ITEMS } from "./app-shell"

/** شیت «بیشتر» موبایل — دسترسی به همه بخش‌ها */
export function MoreSheet() {
  const { moreSheetOpen, setMoreSheetOpen } = useUIStore()
  const pathname = usePathname()

  return (
    <Drawer open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
      <DrawerContent className="rounded-t-[24px] mx-auto max-w-md" dir="rtl">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center text-sm font-semibold">همه بخش‌ها</DrawerTitle>
        </DrawerHeader>
        <div className="grid grid-cols-4 gap-2 p-4 pt-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreSheetOpen(false)}
                className="flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors duration-200 hover:bg-accent active:scale-95"
              >
                <span
                  className={
                    active
                      ? "flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"
                      : "flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground"
                  }
                >
                  <item.icon className="size-5" />
                </span>
                <span className="text-[0.68rem] font-medium text-muted-foreground">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
