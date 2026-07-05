#!/usr/bin/env bash
# Production deploy script — run on the Lightsail server from /var/www/nadakarate
set -euo pipefail

cd "$(dirname "$0")"

git pull origin main

echo "== API =="
cd api
npm install --production
npm run migrate
pm2 restart nadakarate-api
cd ..

echo "== Frontend =="
cd app
npm install
npm run build
rm -rf ../frontend/*
cp -r dist/* ../frontend/
cd ..

sudo nginx -s reload

echo "== Health check =="
curl -f http://127.0.0.1:3001/api/health
