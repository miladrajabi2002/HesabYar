import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, parseBody, requireApiAuth, serverError } from "@/lib/api-helpers"
import { accountCreateSchema } from "@/lib/validation"
import { getAccountBalances } from "@/lib/finance"

export const dynamic = "force-dynamic"

/** GET /api/accounts — لیست حساب‌های بانکی با تراز + گردش اخیر */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const accounts = await getAccountBalances()
    const withBankInfo = await Promise.all(
      accounts.map(async (a) => ({
        ...a,
        recent: await db.transaction.findMany({
          where: { accountId: a.id },
          orderBy: { date: "desc" },
          take: 5,
        }),
      }))
    )
    return ok({ accounts: withBankInfo })
  } catch (e) {
    return serverError(e)
  }
}

/** POST /api/accounts — افزودن حساب بانکی (فقط بانک؛ نقدی نداریم) */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req)
  if (auth) return auth
  try {
    const { data, error } = await parseBody(req, accountCreateSchema)
    if (error) return error
    const account = await db.account.create({
      data: {
        name: data.name,
        bankKey: data.bankKey,
        accountNumber: data.accountNumber,
        cardNumber: data.cardNumber,
        initialBalance: data.initialBalance,
      },
    })
    return ok({ account })
  } catch (e) {
    return serverError(e)
  }
}
