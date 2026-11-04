#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  حساب‌یار — اسکریپت استقرار یک‌کلیکی (OPS-03)
#  git pull → install → migrate → build → restart → health-check
#  استفاده:  bash /var/www/miladrajabi.com/hesabyar/deploy.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

BOLD="\033[1m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; RESET="\033[0m"
step() { printf "${BOLD}${GREEN}▶ %s${RESET}\n" "$1"; }
fail() { printf "${BOLD}${RED}✖ %s${RESET}\n" "$1"; exit 1; }

# ── ۰) پیش‌نیازها
[ -f .env ] || fail "فایل .env پیدا نشد"
git config --global --add safe.directory "$PWD" 2>/dev/null || true
echo -e "${BOLD}🚀 استقرار حساب‌یار — $(date '+%Y-%m-%d %H:%M:%S')${RESET}"

# ── ۱) کش‌کردن تغییرات محلی ناخواسته (اگر بود)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${YELLOW}⚠ تغییرات محلی комیت‌نشده هست؛ stash می‌کنیم…${RESET}"
  git stash push -m "auto-stash before deploy $(date +%s)"
fi

# ── ۲) گیت
step "دریافت آخرین کد (git pull)"
if git pull --ff-only origin main 2>/dev/null; then
  git log -1 --oneline
else
  echo -e "${YELLOW}.pull انجام نشد (شاید آفلاین یا بدون تغییر جدید) — ادامه با کد فعلی${RESET}"
fi

# ── ۳) وابستگی‌ها
step "نصب وابستگی‌ها (npm install)"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

# ── ۴) دیتابیس (جدول‌های جدید، بدون از دست رفتن داده)
step "همگام‌سازی دیتابیس (prisma db push)"
npx prisma db push --skip-generate
npx prisma generate

# ── ۵) بیلد
step "بیلد پروداکشن (next build)"
rm -rf .next
npx next build

# ── ۶) ری‌استارت
step "ری‌استارت سرویس (pm2)"
pm2 restart hesabyar --update-env

# ── ۷) بررسی سلامت
step "بررسی سلامت (health-check)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/login || true)
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" = "200" ]; then
  echo -e "${BOLD}${GREEN}✅ استقرار موفق — حساب‌یار روی https://hesabyar.miladrajabi.com زنده است${RESET}"
  pm2 logs hesabyar --lines 5 --nostream || true
else
  fail "سرویس بعد از ۲۰ ثانیه بالا نیامد! لاگ: pm2 logs hesabyar"
fi
