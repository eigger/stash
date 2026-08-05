const fs = require("fs");
const path = require("path");

const root = path.join("apps", "web", ".next");

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function exists(p) {
  return fs.existsSync(p);
}

const pages = ["items/[id]", "items/new", "scan"];
for (const p of pages) {
  const man = path.join(root, "server", "app", p, "page_client-reference-manifest.js");
  if (!exists(man)) {
    console.log(p, "NO MANIFEST");
    continue;
  }
  const s = read(man);
  console.log("---", p, "---");
  console.log("  mentions library:", /zxing[/\\]library|@zxing\/library/.test(s));
  console.log("  mentions browser:", /zxing[/\\]browser|@zxing\/browser/.test(s));
  const chunks = [...s.matchAll(/static\/chunks\/[^"']+/g)].map((m) => m[0]);
  const uniq = [...new Set(chunks)];
  let total = 0;
  let zx = 0;
  for (const c of uniq) {
    const fp = path.join(root, c);
    if (!exists(fp)) continue;
    const sz = fs.statSync(fp).size;
    total += sz;
    const body = read(fp);
    if (/BarcodeFormat|DecodeHintType|@zxing|zxing/.test(body)) zx += sz;
  }
  console.log(
    "  client chunks:",
    uniq.length,
    "totalKB",
    +(total / 1024).toFixed(1),
    "zxingInThoseKB",
    +(zx / 1024).toFixed(1),
  );
}

function walk(d, a = []) {
  if (!exists(d)) return a;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (e.name.endsWith(".js")) a.push(p);
  }
  return a;
}

const all = walk(path.join(root, "static", "chunks"));
const lib = all
  .filter((f) => /zxing|BarcodeFormat|DecodeHintType/.test(read(f)))
  .map((f) => ({
    kb: +(fs.statSync(f).size / 1024).toFixed(1),
    f: f.replace(/\\/g, "/").replace(/^.*?\.next\//, ".next/"),
  }))
  .sort((a, b) => b.kb - a.kb);
console.log("static chunks with zxing markers:");
for (const h of lib.slice(0, 20)) console.log(" ", h.kb + "KB", h.f);

for (const p of pages) {
  const nft = path.join(root, "server", "app", p, "page.js.nft.json");
  if (!exists(nft)) continue;
  const j = JSON.parse(read(nft));
  const files = j.files || [];
  const zx = files.filter((x) => /zxing/.test(x));
  console.log("nft", p, "zxingDeps", zx.length);
}
