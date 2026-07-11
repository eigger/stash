import { chromium } from "playwright-core";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

// 실제 로그인 세션으로 주요 화면을 캡처해 docs/screenshots/{ko,en}/ 에 저장한다.
// README.md(영문)·README.ko.md(국문)가 이 이미지를 참조한다.
//
// 요구사항: API가 :8080, 웹이 :3000에서 떠 있어야 하고, 데모 데이터가 들어 있어야 한다.
//   ADMIN_EMAIL / ADMIN_PASSWORD 로 로그인 계정을 지정한다(기본 admin@example.com / changeme).
//   LOCALES=ko,en 으로 캡처할 로케일을 고른다.
//   CHROME_PATH 로 사용할 Chromium 실행 파일 경로를 지정할 수 있다.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "../docs/screenshots");
const email = process.env.ADMIN_EMAIL || "admin@example.com";
const password = process.env.ADMIN_PASSWORD || "changeme";
const locales = (process.env.LOCALES || "ko,en").split(",").map((s) => s.trim()).filter(Boolean);

async function waitReady(page) {
  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || "";
        return t.length > 0 && !t.includes("불러오는 중") && !t.includes("Loading");
      },
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(600);
}

async function shot(page, filePath) {
  await waitReady(page);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log("saved", path.relative(OUT, filePath));
}

async function captureLocale(locale) {
  const dir = path.join(OUT, locale);
  await fs.mkdir(dir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      // 카메라 스캔 화면에서 실제 getUserMedia가 동작하도록 가짜 미디어 장치를 붙인다.
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: locale === "en" ? "en-US" : "ko-KR",
    permissions: ["camera"],
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((loc) => localStorage.setItem("stash_locale", loc), locale);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page
    .waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 })
    .catch(async () => console.log(`[${locale}] still on login:`, (await page.innerText("body")).slice(0, 160)));

  await page.evaluate((loc) => localStorage.setItem("stash_locale", loc), locale);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "01-dashboard.png"));

  await page.goto(`${BASE}/scan`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // 카메라 프리뷰가 뜰 시간을 준다
  await shot(page, path.join(dir, "02-scan.png"));

  await page.goto(`${BASE}/items`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "03-items.png"));

  const itemHref = await page
    .locator('a.name[href^="/items/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (itemHref && !itemHref.endsWith("/new")) {
    await page.goto(`${BASE}${itemHref}`, { waitUntil: "domcontentloaded" });
    await shot(page, path.join(dir, "04-item-detail.png"));
  }

  await page.goto(`${BASE}/shopping`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "05-shopping.png"));

  await page.goto(`${BASE}/backup`, { waitUntil: "domcontentloaded" });
  await shot(page, path.join(dir, "06-more.png"));

  await browser.close();
}

for (const locale of locales) {
  console.log("--- capturing", locale);
  await captureLocale(locale);
}
console.log("done");
