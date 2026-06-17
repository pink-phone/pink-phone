// Génère les captures du README depuis le Storybook buildé (storybook-static),
// via Playwright, dans un cadre mobile. Contenu = données mock des stories
// (rien d'intime réel) → sûr pour un dépôt public.
//
//   npm run build-storybook        # produit storybook-static/
//   npm run screenshots            # écrit docs/screenshots/*.png
//
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SB = resolve(__dirname, "..", "storybook-static");
const OUT = resolve(__dirname, "..", "..", "docs", "screenshots");

// Écrans à capturer : (titre de la story, fichier, nom de variante préféré).
const TARGETS = [
  { title: "Écrans/DashboardScreen", file: "dashboard.png" },
  { title: "Écrans/BlogScreen", file: "blog.png", prefer: "Par Défaut" },
  {
    title: "Écrans/BlogScreen",
    file: "blog-comments.png",
    prefer: "Avec commentaires ouverts",
  },
  { title: "Écrans/ChallengesScreen", file: "challenges.png" },
  { title: "Écrans/ChallengeBankScreen", file: "challenge-bank.png" },
  { title: "Écrans/SettingsScreen", file: "settings.png", prefer: "Interactif" },
  { title: "Écrans/AuthScreen", file: "auth.png" },
  { title: "Écrans/OnboardingScreen", file: "onboarding.png" },
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let p = decodeURIComponent(url.pathname);
      if (p === "/") p = "/index.html";
      const filePath = join(dir, p);
      const buf = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () =>
      ok({ server, port: server.address().port }),
    ),
  );
}

async function main() {
  if (!existsSync(SB)) {
    console.error("storybook-static/ absent — lance `npm run build-storybook`.");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  const index = JSON.parse(await readFile(join(SB, "index.json"), "utf8"));
  const entries = Object.values(index.entries ?? index.stories);

  const { server, port } = await serve(SB);
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    // Cadre « grand téléphone » (un peu plus large que l'iPhone standard).
    viewport: { width: 440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-US", // captures 100 % anglaises (i18n + relativeTime)
    reducedMotion: "reduce", // fige les animations (braise, etc.)
  });
  const page = await context.newPage();

  for (const t of TARGETS) {
    const matches = entries.filter(
      (e) => e.title === t.title && e.type !== "docs",
    );
    const entry = t.prefer
      ? (matches.find((e) => e.name === t.prefer) ?? matches[0])
      : matches[0];
    if (!entry) {
      console.warn(`⚠️  story introuvable pour ${t.title} — ignorée`);
      continue;
    }
    const url = `${base}/iframe.html?viewMode=story&id=${encodeURIComponent(entry.id)}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, t.file), type: "png" });
    console.log(`✓ ${t.file}  ←  ${t.title} / ${entry.name}`);
  }

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
