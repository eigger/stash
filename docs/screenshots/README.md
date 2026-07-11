# Screenshots

| Path | Locale |
|---|---|
| `ko/*.png` | Korean UI — used by [`README.ko.md`](../../README.ko.md) |
| `en/*.png` | English UI — used by [`README.md`](../../README.md) |

| File | Screen |
|---|---|
| `01-dashboard.png` | Home dashboard (total value, low stock, expiring, recent) |
| `02-scan.png` | Continuous barcode/QR scan |
| `03-items.png` | Item list (search / filter / sort / CSV) |
| `04-item-detail.png` | Item detail |
| `05-shopping.png` | Shopping list |
| `06-more.png` | More menu |

```sh
# both locales (API on :8080, web on :3000, demo data seeded)
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs

# one locale
LOCALES=en ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/capture-screenshots.mjs
```

Requires `playwright-core` and a Chromium build. Pass `CHROME_PATH=/path/to/chromium` if it is not auto-detected.
