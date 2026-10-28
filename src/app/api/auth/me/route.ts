import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({ authenticated: true, user: "admin" })
}
