/**
 * ساخت لوگو و آیکون‌های PWA از روی lib/brand.ts — اجرا: npx tsx scripts/build-icons.ts
 */
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { brandSvg, BRAND_MARK } from "../src/lib/brand"

const pub = path.join(process.cwd(), "public")
fs.writeFileSync(path.join(pub, "logo.svg"), brandSvg(48, "l"))

/** نسخهٔ maskable: نشانه کوچک‌تر وسط یک پس‌زمینهٔ تمام‌رنگ (ناحیهٔ امن ۸۰٪) */
function maskableSvg(): string {
  const { check, coin, ledger } = BRAND_MARK
  return `<svg width="512" height="512" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#1cc79d"/><stop offset="0.5" stop-color="#0b8a6d"/><stop offset="1" stop-color="#05503f"/></linearGradient>
  <linearGradient id="c" x1="30" y1="11" x2="39" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#ffd86b"/><stop offset="1" stop-color="#f08c00"/></linearGradient></defs>
  <rect width="48" height="48" fill="url(#g)"/>
  <g transform="translate(24 24) scale(0.72) translate(-24 -24)">
    <rect x="${ledger.x}" y="${ledger.y}" width="${ledger.w}" height="${ledger.h}" rx="${ledger.h / 2}" fill="#fff" fill-opacity="0.38"/>
    <path d="${check}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coin.cx}" cy="${coin.cy}" r="${coin.r}" fill="url(#c)" stroke="#fff" stroke-width="2.2"/>
  </g></svg>`
}

async function main() {
  const out = path.join(pub, "icons")
  const tile = Buffer.from(brandSvg(512, "t"))
  await sharp(tile, { density: 400 }).resize(192, 192).png().toFile(path.join(out, "icon-192.png"))
  await sharp(tile, { density: 400 }).resize(512, 512).png().toFile(path.join(out, "icon-512.png"))
  await sharp(tile, { density: 400 }).resize(64, 64).png().toFile(path.join(out, "favicon.png"))
  const mask = Buffer.from(maskableSvg())
  await sharp(mask, { density: 400 }).resize(512, 512).png().toFile(path.join(out, "maskable-512.png"))
  // آیکون اپل: بدون گوشهٔ گرد (iOS خودش گرد می‌کند)
  await sharp(mask, { density: 400 }).resize(180, 180).png().toFile(path.join(out, "apple-touch-icon.png"))
  console.log("✓ icons built")
}
main()
