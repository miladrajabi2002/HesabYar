/**
 * PM2 — حساب‌یار (hesabyar.miladrajabi.com)
 * همه‌چیز داخل همین پوشه: کد، .env و داده‌ها (data/: hesabyar.db، uploads، backups)
 * ثبت دوباره با محیط تمیز (تا متغیرهای شِل/سشن به پروسه نشت نکنند):
 *   env -i HOME=/root PATH="$(dirname "$(which node)"):/usr/bin:/bin" pm2 start ecosystem.config.cjs && pm2 save
 * استقرار:  bash deploy.sh
 */
module.exports = {
  apps: [
    {
      name: "hesabyar",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production", PORT: "3100" },
      max_memory_restart: "800M",
    },
  ],
}
