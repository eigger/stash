# Stash

[![CI](https://github.com/eigger/stash/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/stash/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/stash/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/stash/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/stash)](https://github.com/eigger/stash/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/stash.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fstash-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/stash/pkgs/container/stash-api)

**[한국어 README](./README.ko.md)**

Self-hosted home inventory & barcode manager — track everything you own by scanning existing product barcodes (UPC/EAN), self-issued QR labels, or Matter pairing codes. Restock/consume with one continuous scan, watch low-stock and expiry from the dashboard, and print labels.

> Current release: **v0.6.5**

Docs: [`docs/ROADMAP.md`](./docs/ROADMAP.md)

---

## Features

- Nested locations (rooms / shelves / boxes) rendered as an indented tree, and categories
- Items with quantity, low-stock threshold, expiry & warranty dates, price, notes — name and unit are inline-editable right on the item detail page. An optional photo can be taken *or* picked from the gallery right in the "add manually" form (auto-resized on upload), and price uses a default currency (KRW/USD, set once in Settings) instead of typing it on every item
- Unified `Item` + `Barcode` model — existing UPC/EAN, self-issued internal QR (deep-links to the item), a Matter pairing code, or a manually-entered serial number, all as one barcode type, each with its own **print** button so printing an item with several barcodes always sends the one you meant. Items added without a barcode get an internal QR issued automatically (no manual step needed later), and the manual "add item" form has separate **Register** / **Register & Print** buttons instead of a checkbox. Manual barcode/QR/serial entry lives behind a single collapsed toggle; scanning with the camera auto-detects the type (barcode vs. QR/Matter, asset-only) and its exact symbology instead of asking which kind you're adding
- Asset mode alongside quantity tracking — flip an item to **Asset** to track a single physical device: condition (new / in use / needs repair / retired), a serial-number barcode entry, and a maintenance-history log (date, description, cost). Asset items hide the quantity stepper/low-stock fields, are excluded from shopping-list/low-stock logic, and scanning an asset's barcode redirects to its detail page instead of adjusting quantity
- File attachments for receipts, manuals, warranties, and photos — a single upload flow stores multiple PDF or image documents per item/asset, shown as real thumbnails (not just file links), with image auto-resizing on upload. Any image attachment can be set as the item's representative photo — shown as a small profile-style avatar next to the item name, automatic when there's only one image and a manual picker once there are several
- Continuous camera scanning: **Restock (+1)** / **Consume (−1)** modes, no screen transition between scans; camera scan is also available when registering an item manually or adding a barcode/Matter code. Tuned for real-world speed/accuracy (format hints, higher resolution, continuous autofocus), with an audible beep, haptic buzz, and a low-light flash toggle. A newly auto-created item gets a quick inline sheet to set its location/threshold on the spot
- Pluggable external product lookup (Open Food Facts, UPCItemDB, Naver Shopping) — pick which providers to use per barcode scan, or turn lookup off entirely
- Dashboard: total inventory value, low-stock and expiring-soon items front and center, plus a first-run onboarding checklist (location, notifications, public URL)
- Shopping list as its own bottom tab — built from low-stock items or anything manually added regardless of stock level, with a memo line and a bought checkbox
- Item list with search (name or barcode value), location/category filters, sort, pagination, and remembers your last filter/sort; bulk-select items to move location/category or delete at once
- Undo on delete — deleting an item shows an inline **Undo** toast
- CSV import / export (including barcode values) for bulk entry and spreadsheet round-trips
- Label printing: single PNG, or a bundled A4 label-sheet PDF (Korean names render via a bundled Noto Sans KR subset), with a search box on the label picker
- Expiry / warranty push notifications, plus a weekly low-stock digest (Web Push)
- Trash (soft delete) with restore and 30-day auto-purge
- Offline-friendly PWA: cached app shell and cached item list/detail responses for offline viewing, home-screen shortcuts for Scan / Add item, and an offline scan queue that auto-syncs when back online
- Bottom navigation is centered in a max-width column on wide screens instead of stretching edge to edge; **More** opens as a slide-up bottom sheet (grouped shortcuts to locations, categories, history, labels, trash, settings, family accounts, integrations) instead of a separate page
- Outbound inventory webhook for printer / label-device automations (e.g. Home Assistant), with the last delivery failure surfaced in Settings
- Admin / general roles, first-admin bootstrap, self-service password change, backup/restore, ko/en i18n, light/dark theme

---

## Screenshots & how to use

### 1. Dashboard

Home screen after login. Shows total inventory value, **Low stock**, **Expiring soon**, and **Recently added**. Tap `+` / `−` on any card to adjust quantity in place, or jump to **View shopping list**.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/01-dashboard.png" alt="Dashboard" width="340" />

### 2. Scan

Scan barcodes or QR codes continuously without changing screens. Choose between **Restock (+1)** or **Consume (-1)** modes to update inventory instantly. It supports audible beeps, haptics, and a flashlight toggle for low-light scanning. Unknown barcodes are automatically created and open a mini-sheet to assign a location and threshold immediately. Manual entry is also available for devices without cameras.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/02-scan.png" alt="Scan" width="340" />

### 3. Items

Browse all items with search, **location** / **category** filters, and **sorting** (recently added, lowest quantity, expiring soonest). You can bulk-select items to move their location/category or delete them at once, as well as import/export the entire list as CSV.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/03-items.png" alt="Items" width="340" />

### 4. Item detail

Manage quantity, location, category, low-stock threshold, expiry and warranty dates, price, and photos. You can associate multiple barcodes, generate internal QR labels, add Matter codes, send print requests, or upload attachments (receipts, manuals, warranties as PDF/images). Detailed adjustment logs, maintenance logs, and audit histories are listed at the bottom.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/04-item-detail.png" alt="Item detail" width="340" />

### 5. Shopping list

Displays low-stock items and manually added items as a checklist. Tap `+` for each item you buy; once its stock rises above the threshold, it drops off the list automatically. Supports custom notes and purchase checkmarks.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/en/05-shopping.png" alt="Shopping list" width="340" />

### 6. More

A slide-up bottom sheet menu accessed via the bottom navigation bar. It is cleanly grouped into: **Structure** (manage locations & categories), **Actions & records** (maintenance history, print labels, trash), and **Account & integrations** (settings, family accounts, integration settings).

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

Set one URL under **Settings → Integrations**. Stash POSTs a JSON payload on item create / update / scan and on an explicit print request, so a receiving automation (e.g. Home Assistant) can render its own label. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the payload shape.

Via Home Assistant you can use:

- [hass-niimbot](https://github.com/eigger/hass-niimbot) — Niimbot label printing
- [hass-gicisky](https://github.com/eigger/hass-gicisky) — Gicisky electronic labels (inventory display, expiry dates, and more)

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
