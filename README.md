# Stash

[![CI](https://github.com/eigger/stash/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/stash/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/stash/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/stash/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/stash)](https://github.com/eigger/stash/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/stash.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fstash-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/stash/pkgs/container/stash-api)

**[한국어 README](./README.ko.md)**

Self-hosted home inventory & barcode manager — track everything you own by scanning existing product barcodes (UPC/EAN), self-issued QR labels, or Matter pairing codes. Restock/consume with one continuous scan, watch low-stock and expiry from the dashboard, and print labels.

> Current release: **v0.3.0**

Docs: [`docs/ROADMAP.md`](./docs/ROADMAP.md)

---

## Features

- Nested locations (rooms / shelves / boxes) and categories
- Items with quantity, low-stock threshold, expiry & warranty dates, price, photo, notes
- Unified `Item` + `Barcode` model — existing UPC/EAN, self-issued internal QR (deep-links to the item), or a Matter pairing code, all as one barcode type
- Continuous camera scanning: **Restock (+1)** / **Consume (−1)** modes, no screen transition between scans; camera scan is also available when registering an item manually or adding a barcode/Matter code
- Pluggable external product lookup (Open Food Facts, UPCItemDB, Naver Shopping) — pick which providers to use per barcode scan, or turn lookup off entirely
- Dashboard: total inventory value, low-stock and expiring-soon items front and center
- Shopping list built from low-stock items — buy, tap `+`, and it drops off automatically
- Item list with search, location/category filters, sort, pagination, and remembers your last filter/sort; bulk-select items to move location/category or delete at once
- Undo on delete — deleting an item shows an inline **Undo** toast
- CSV import / export (including barcode values) for bulk entry and spreadsheet round-trips
- Label printing: single PNG, or a bundled A4 label-sheet PDF (Korean names render via a bundled Noto Sans KR subset)
- Expiry / warranty push notifications, plus a weekly low-stock digest (Web Push)
- Trash (soft delete) with restore and 30-day auto-purge
- Offline-friendly PWA: cached app shell, home-screen shortcuts for Scan / Add item, and an offline scan queue that auto-syncs when back online
- Outbound inventory webhook for printer / label-device automations (e.g. Home Assistant)
- Admin / general roles, first-admin bootstrap, backup/restore, ko/en i18n, light/dark theme

---

## Screenshots & how to use

### 1. Dashboard

Home screen after login. Shows total inventory value, **Low stock**, **Expiring soon**, and **Recently added**. Tap `+` / `−` on any card to adjust quantity in place, or jump to **View shopping list**.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/01-dashboard.png" alt="Dashboard" width="340" />

### 2. Scan

Continuous barcode / QR scanning. Pick **Restock (+1)** or **Consume (−1)**, then keep scanning without leaving the screen — matched items adjust quantity, unknown barcodes auto-create an item. Camera-less devices can type the barcode in manually.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/02-scan.png" alt="Scan" width="340" />

### 3. Items

Every item with search, **location** / **category** filters, and **sort** (recently added / lowest quantity / expiring soonest). Export or import the whole list as CSV from here.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/03-items.png" alt="Items" width="340" />

### 4. Item detail

Edit quantity, location, category, low-stock threshold, expiry / warranty dates, price, and photo. Attach existing barcodes, issue an internal QR, add a Matter code, or send a print request. Quantity history is listed below.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/04-item-detail.png" alt="Item detail" width="340" />

### 5. Shopping list

Low-stock items as a checklist. Tap `+` for each one you buy — once it climbs back above its threshold it drops off the list automatically.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/05-shopping.png" alt="Shopping list" width="340" />

### 6. More

Grouped menu: **Structure** (locations, categories), **Actions & records** (shopping list, labels, trash), and **Account & integrations** (settings, family accounts, integration keys).

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/06-more.png" alt="More menu" width="340" />

---

## Quick start

### 1. Install

**Proxmox (recommended)**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/stash/master/proxmox/ct/stash.sh)"
```

The community-scripts-style installer creates a Debian 13 LXC with Docker, writes the deploy files and a `.env` with random secrets to `/opt/stash`, and starts the stack via a `stash.service` systemd unit. Open `http://<LXC_IP>` when finished. Update later with `update` inside the container.

**Docker Compose**

```sh
docker compose -f docker-compose.prod.yml up -d
```

Set `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env` first. Images come from `ghcr.io/<owner>/stash-api` / `stash-web` — set `GH_REPOSITORY_OWNER` (and the image names in `proxmox/install/stash-install.sh`) to match your fork.

### 2. Create the first admin

On a fresh install, `/login` shows **Create first admin** when no users exist.

1. Open `/login`
2. Enter name, email, password
3. Submit — you are signed in as `ADMIN`

Public sign-up is disabled. Later accounts are created only by an admin under **More → Family accounts**.

### 3. Set up locations & categories

From **More → Manage locations / categories**, create where things live (rooms, shelves, fridge…) and how they group (food, household, electronics…). Both are nestable and optional — you can also fill them in later per item.

### 4. Day-to-day

| Task | Where |
|---|---|
| Restock / consume by scanning | **Scan** (bottom tab) |
| Add an item without a barcode | Items → **Add manually** |
| Adjust quantity quickly | `+` / `−` on any item card |
| What to buy | Dashboard → **View shopping list** |
| Bulk import / export | Items → **Import / Export CSV** |
| Print labels | More → **Print labels** |
| Restore a deleted item | More → **Trash** |
| Expiry / warranty alerts | Settings → **Notifications** |
| Backup / restore | Settings → **Backup / restore** |

### 5. Inventory webhook (optional)

Set one URL under **Settings → Integrations**. Stash POSTs a JSON payload on item create / update / scan and on an explicit print request, so a receiving automation (e.g. Home Assistant driving a BLE label printer) can render its own label. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the payload shape.

---

## Project structure

```
stash/
  apps/
    api/      # Fastify + Prisma
    web/      # Next.js App Router (PWA, ko/en)
  packages/
    shared/   # Shared Zod schemas
  scripts/    # capture-screenshots.mjs
  docker-compose.yml / docker-compose.prod.yml
  Caddyfile
  proxmox/    # LXC one-click install
```

---

## Local development

```sh
npm install
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d postgres
npm run prisma:migrate
npm run seed -w apps/api   # optional: seed admin instead of the bootstrap UI
npm run dev:api            # :8080
npm run dev:web            # :3000
```

Open `http://localhost:3000/login`.

Useful scripts: `npm run build`, `npm run test`, `npm run prisma:generate`.

---

## Production notes

- Stack: PostgreSQL 16 + API + Web + Caddy (`:80`)
- API runs `prisma migrate deploy` on startup (prod compose)
- Images: `ghcr.io/<owner>/stash-api` / `stash-web` (`latest` + semver tags)
- Update LXC: `update` in the container (pulls compose images)
- External barcode lookup (Open Food Facts, UPCItemDB) is optional — manual entry and self-issued QR codes work standalone
- `APP_PUBLIC_URL` controls the deep-link encoded into self-issued QR labels; set it to your real domain so labels open the app from any camera app

---

## CI/CD

| Workflow | Trigger | Purpose |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | Push / PR to `master` | Install, build, test |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release | Push images to GHCR |

---

## License

MIT. See [LICENSE](./LICENSE).
