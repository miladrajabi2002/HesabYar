/**
 * Passkey / WebAuthn — lib/passkey.ts (SEC-01)
 * ورود با Face ID / Touch ID مثل همراه بانک مسکن:
 * بعد از اولین ورود، کلید روی دستگاه ذخیره می‌شود و دیگر یوزرنیم/پسورد لازم نیست.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server"
import { db } from "./db"

/** استخراج rpID و origin از هدر درخواست (پشتیبانی دامنه پروداکشن و لوکال) */
export function rpFromRequest(req: Request): { rpID: string; origin: string } {
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") || (forwardedHost.includes("localhost") ? "http" : "https")
  const rpID = forwardedHost.split(":")[0]
  return { rpID, origin: `${proto}://${forwardedHost}` }
}

/**
 * ذخیره موقت challenge — اپ تک‌کاربره و تک‌پروسه است؛
 * نگهداری در حافظه گلوبال کافی و امن است (challenge یک‌بار‌مصرف).
 */
const challengeStore = (globalThis as unknown as {
  __hesabyarChallenges?: Map<string, { challenge: string; exp: number }>
}).__hesabyarChallenges ?? new Map<string, { challenge: string; exp: number }>()
;(globalThis as unknown as { __hesabyarChallenges?: Map<string, { challenge: string; exp: number }> }).__hesabyarChallenges =
  challengeStore

function saveChallenge(key: string, challenge: string): void {
  // پاک‌سازی موارد منقضی
  const now = Date.now()
  for (const [k, v] of challengeStore) if (v.exp < now) challengeStore.delete(k)
  challengeStore.set(key, { challenge, exp: now + 5 * 60_000 })
}

function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key)
  if (!entry) return null
  challengeStore.delete(key)
  return entry.exp > Date.now() ? entry.challenge : null
}

/** گزینه‌های ثبت passkey جدید (نیازمند نشست معتبر) */
export async function buildRegistrationOptions(req: Request, deviceName?: string) {
  const { rpID } = rpFromRequest(req)
  const existing = await db.passkey.findMany({ select: { credentialId: true } })
  const options = await generateRegistrationOptions({
    rpName: "حساب‌یار",
    rpID,
    userID: new TextEncoder().encode("hesabyar-admin"),
    userName: "admin",
    userDisplayName: deviceName || "مدیر حساب‌یار",
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId })),
    authenticatorSelection: {
      residentKey: "preferred", // discoverable credential — ورود بدون نام کاربری
      userVerification: "preferred", // Face ID / Touch ID / پین
    },
  })
  saveChallenge("register", options.challenge)
  return options
}

/** گزینه‌های ورود با passkey (بدون نیاز به نشست) */
export async function buildAuthenticationOptions(req: Request) {
  const { rpID } = rpFromRequest(req)
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  })
  saveChallenge("login", options.challenge)
  return options
}

/** تأیید پاسخ ثبت — خروجی credential برای ذخیره در DB */
export async function verifyRegistrationResponseWrapper(
  req: Request,
  credential: Record<string, unknown>
) {
  const { rpID, origin } = rpFromRequest(req)
  const challenge = consumeChallenge("register")
  if (!challenge) throw new Error("درخواست ثبت منقضی شده — دوباره تلاش کنید")
  return verifyRegistrationResponse({
    response: credential as never,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  })
}

/** تأیید پاسخ ورود — اگر موفق باشد نشست صادر می‌شود */
export async function verifyAuthenticationResponseWrapper(
  req: Request,
  credential: Record<string, unknown>
) {
  const { rpID, origin } = rpFromRequest(req)
  const challenge = consumeChallenge("login")
  if (!challenge) throw new Error("درخواست ورود منقضی شده — دوباره تلاش کنید")
  const credId = String((credential as { id?: string }).id ?? "")
  const passkey = credId
    ? await db.passkey.findUnique({ where: { credentialId: credId } })
    : null
  if (!passkey) throw new Error("این کلید ثبت نشده است")
  const verification = await verifyAuthenticationResponse({
    response: credential as never,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64")),
      counter: passkey.counter,
      transports: (passkey.transports?.split(",").filter(Boolean) as never[]) || [],
    },
    requireUserVerification: false,
  })
  if (verification.verified) {
    await db.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    })
  }
  return verification
}
