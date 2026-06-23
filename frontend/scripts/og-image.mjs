// Génère l'image de partage social (Open Graph / Twitter card) de la landing :
// docs/og.png en 1200×630 (paysage), DA "felted", via Playwright (mêmes polices
// que le site). Compose la capture du dashboard (mock, déjà dans docs/screenshots).
//
//   npm run build-storybook && npm run screenshots   # produit docs/screenshots/*
//   npm run og                                        # écrit docs/og.png
//
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dirname, "..", "..", "docs");

const W = 1200;
const H = 630;

// Capture du tableau de bord (mock) embarquée en data URI pour un rendu autonome.
const shot = await readFile(resolve(DOCS, "screenshots", "dashboard.png"));
const phone = `data:image/png;base64,${shot.toString("base64")}`;

const html = `<!doctype html><html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,700;1,500&display=swap" rel="stylesheet" />
<style>
  :root{
    --charcoal:#1b1614; --taupe:#b9a89c; --taupe-dim:#8d7f75;
    --blush:#f6e7dc; --spice:#d4805a; --spice-soft:#e0a182; --line:rgba(212,128,90,.22);
  }
  *{box-sizing:border-box;margin:0;}
  body{
    width:${W}px;height:${H}px;overflow:hidden;
    font-family:"Inter",system-ui,sans-serif;color:var(--taupe);
    background:
      radial-gradient(900px 520px at 88% -8%, rgba(126,39,56,.45), transparent 60%),
      radial-gradient(760px 460px at -6% 12%, rgba(212,128,90,.18), transparent 55%),
      var(--charcoal);
    display:flex;align-items:center;
  }
  .left{flex:1;padding:0 0 0 76px;}
  .badge{display:inline-block;font-size:14px;letter-spacing:.18em;text-transform:uppercase;
    color:var(--taupe-dim);border:1px solid var(--line);border-radius:999px;padding:7px 16px;margin-bottom:26px;}
  h1{font-family:"Playfair Display",Georgia,serif;color:var(--blush);font-weight:700;
    font-size:84px;line-height:1.05;margin-bottom:10px;}
  h1 .flame{filter:drop-shadow(0 0 18px rgba(212,128,90,.6));}
  .tagline{font-family:"Playfair Display",serif;font-style:italic;color:var(--spice-soft);
    font-size:34px;margin-bottom:22px;}
  .sub{font-size:23px;line-height:1.5;max-width:560px;color:var(--taupe);}
  .pills{margin-top:30px;display:flex;gap:10px;flex-wrap:wrap;max-width:560px;}
  .pills span{font-size:15px;color:var(--taupe-dim);border:1px solid var(--line);
    border-radius:999px;padding:7px 14px;}
  .right{position:relative;width:430px;height:100%;}
  .phone{position:absolute;top:50%;left:30px;transform:translateY(-50%) rotate(4deg);
    width:300px;border-radius:34px;border:1px solid rgba(212,128,90,.25);
    box-shadow:0 40px 90px -20px rgba(0,0,0,.7), 0 0 60px -10px rgba(126,39,56,.5);}
</style></head>
<body>
  <div class="left">
    <span class="badge">Self-hosted · No app store</span>
    <h1>Pink&nbsp;Phone <span class="flame">🔥</span></h1>
    <p class="tagline">A couple's secret garden.</p>
    <p class="sub">An intimate PWA for two — a shared journal, a daily “weather of desire”, and playful dares. You host it; your data stays yours.</p>
    <div class="pills"><span>React PWA</span><span>Rust / Axum</span><span>Encrypted media</span><span>AGPL-3.0</span></div>
  </div>
  <div class="right"><img class="phone" src="${phone}" /></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(DOCS, "og.png") });
await browser.close();

console.log("✓ docs/og.png (1200×630)");
