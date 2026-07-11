# Stash

Self-hosted home inventory & barcode management — track everything you own by scanning: existing product barcodes (UPC/EAN), self-issued QR labels for anything without one, and Matter/smart-home pairing codes stored as plain identifiers.

Docs: [`docs/ROADMAP.md`](./docs/ROADMAP.md) (phase status + future Home Assistant/Niimbot label printer integration notes)

## Features

- Locations (rooms/shelves/boxes, nested) and categories
- Items with quantity, min-quantity low-stock threshold, expiry date, warranty date, photo, notes
- Barcodes: attach existing UPC/EAN, auto-issue an internal QR that deep-links to the item, or store a Matter pairing code as an identifier — all on one unified `Item` + `Barcode` model
- Continuous camera scanning (`/scan`): scan → existing item quantity +1, or new barcode → auto-created item (external lookup pre-fills name/photo when available) — no screen transition between scans
- Label printing: single label PNG download, or select multiple items and print a bundled A4 label sheet PDF (`/labels`) — Korean item names render via a bundled Noto Sans KR subset since PDF's default font has no Hangul glyphs
- Dashboard: low-stock and expiring-soon items front and center
- Admin/general user roles, first-admin bootstrap on first login
- Backup/restore (tar.gz export of DB + uploaded files)

## Project structure

```
stash/
  apps/
    api/      # Fastify + Prisma
    web/      # Next.js App Router (PWA)
  packages/
    shared/   # Shared Zod schemas
  docker-compose.yml / docker-compose.prod.yml
  Caddyfile
  proxmox/    # LXC one-click install (adapt GH owner/repo before use)
```

## Local development

```sh
npm install
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d postgres
npm run prisma:migrate
npm run dev:api   # :8080
npm run dev:web   # :3000
```

Open `http://localhost:3000/login` and create the first admin account.

## Production

```sh
docker compose -f docker-compose.prod.yml up -d
```

Requires GHCR images (`stash-api`, `stash-web`) published via `.github/workflows/docker-release.yml` — update `GH_REPOSITORY_OWNER` in `.env` and the image names in `docker-compose.prod.yml` / `proxmox/install/stash-install.sh` to match your GitHub repo before relying on the Proxmox installer.

## Notes

- External barcode lookup (Open Food Facts, UPCItemDB) is optional — everything works with manual entry and self-issued QR codes alone.
- `APP_PUBLIC_URL` controls the deep-link URL encoded into self-issued QR labels; set it to your real domain in production so labels open the app from any camera app.
