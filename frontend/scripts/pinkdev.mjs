// pinkdev — outil de dev PinkPhone : scaffold Storybook-first (composant/écran)
// + gate de compilation complète (front + back) + lancement front+back en dev,
// en une commande.
//
//   npm run pinkdev -- new-component MoodBadge
//   npm run pinkdev -- new-screen Onboarding
//   npm run pinkdev -- check [--integration]
//   npm run pinkdev -- dev [--seed]
//   npm run pinkdev -- clean [--volumes]
//
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, "..");
const BACKEND_DIR = resolve(FRONTEND_DIR, "..", "backend");
const DEPLOY_DIR = resolve(FRONTEND_DIR, "..", "deploy");
const COMPOSE_ARGS = ["compose", "-f", "docker-compose.local.yml", "-f", "docker-compose.local-build.yml"];

const [command, ...args] = process.argv.slice(2);

function usageAndExit(code) {
  console.log(`Usage:
  npm run pinkdev -- new-component <Nom>   Composant + story + test (src/components/)
  npm run pinkdev -- new-screen <Nom>      Écran + story + test (src/screens/)
  npm run pinkdev -- check [--integration] Toutes les portes de compilation (front + back)
  npm run pinkdev -- dev [--seed]          Lance db (docker) + API (cargo run) + Vite, ensemble
  npm run pinkdev -- seed                  Jeu de données de démo (2 comptes + espace + contenu)
  npm run pinkdev -- package               Build les images Docker locales (pinkphone-{api,web}:local)
  npm run pinkdev -- docker [--down]       Build + lance la stack complète en Docker (ou l'arrête)
  npm run pinkdev -- clean [--volumes]     Supprime node_modules/target/dist (+ volumes docker avec --volumes)
  npm run pinkdev -- screenshots           Regénère docs/screenshots/* (alias npm run screenshots)
  npm run pinkdev -- og                    Regénère docs/og.png (alias npm run og)`);
  process.exit(code);
}

// ---------- scaffold ----------

/** Composant présentationnel minimal : props via callbacks, pas de fetch/état
 * global (règle golden CLAUDE.md) — juste `className` pour démarrer. */
function componentTemplate(name) {
  return `import { cn } from "../../lib/cn";

export interface ${name}Props {
  className?: string;
}

/** TODO: décrire ${name}. */
export function ${name}({ className }: ${name}Props) {
  return <div className={cn("", className)}>TODO: ${name}</div>;
}
`;
}

function screenTemplate(name) {
  return `export interface ${name}Props {
  className?: string;
}

/** TODO: décrire l'écran ${name}. */
export function ${name}({ className }: ${name}Props) {
  return (
    <main className={className}>
      <h1 className="font-serif text-2xl text-blush-100">${name}</h1>
    </main>
  );
}
`;
}

function storyTemplate(name, group) {
  return `import type { Meta, StoryObj } from "@storybook/react-vite";
import { ${name} } from "./${name}";

const meta = {
  title: "${group}/${name}",
  component: ${name},
  tags: ["autodocs"],
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
`;
}

function testTemplate(name) {
  return `import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ${name} } from "./${name}";

describe("${name}", () => {
  it("rend sans planter", () => {
    render(<${name} />);
    expect(screen.getByText("${name}", { exact: false })).toBeTruthy();
  });
});
`;
}

function scaffold(kind, name) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name ?? "")) {
    console.error(`Nom invalide : "${name}" — attendu en PascalCase (ex: MoodBadge).`);
    process.exit(1);
  }

  const isScreen = kind === "screen";
  const baseDir = resolve(FRONTEND_DIR, "src", isScreen ? "screens" : "components", name);
  if (existsSync(baseDir)) {
    console.error(`${baseDir} existe déjà — rien fait (pas d'écrasement).`);
    process.exit(1);
  }

  mkdirSync(baseDir, { recursive: true });
  const files = {
    [`${name}.tsx`]: isScreen ? screenTemplate(name) : componentTemplate(name),
    [`${name}.stories.tsx`]: storyTemplate(name, isScreen ? "Écrans" : "Composants"),
    [`${name}.test.tsx`]: testTemplate(name),
  };
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(resolve(baseDir, file), content);
  }

  console.log(`Créé src/${isScreen ? "screens" : "components"}/${name}/ :`);
  for (const file of Object.keys(files)) console.log(`  ${file}`);
  console.log(
    `\nRappel (règle Storybook-first) : valide dans Storybook avant de câbler ${name} dans une page.`,
  );
}

// ---------- check ----------

function runStep(label, cmd, cmdArgs, cwd) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: false });
  const ok = result.status === 0;
  if (!ok) {
    console.log(`✖ ${label} (code ${result.status ?? result.signal ?? "?"})`);
  }
  return ok;
}

function check(includeIntegration) {
  const steps = [
    ["frontend: build (tsc + vite)", "npm", ["run", "build"], FRONTEND_DIR],
    ["frontend: build-storybook", "npm", ["run", "build-storybook"], FRONTEND_DIR],
    ["frontend: test (vitest)", "npm", ["run", "test"], FRONTEND_DIR],
    ["backend: cargo build", "cargo", ["build"], BACKEND_DIR],
    ["backend: cargo test", "cargo", ["test"], BACKEND_DIR],
  ];
  if (includeIntegration) {
    steps.push([
      "backend: cargo test --features integration (nécessite Postgres — docker-compose up -d)",
      "cargo",
      ["test", "--features", "integration"],
      BACKEND_DIR,
    ]);
  }

  const results = steps.map(([label, cmd, cmdArgs, cwd]) => [
    label,
    runStep(label, cmd, cmdArgs, cwd),
  ]);

  console.log("\nRésumé :");
  for (const [label, ok] of results) {
    console.log(`  ${ok ? "✔" : "✖"} ${label}`);
  }
  const allOk = results.every(([, ok]) => ok);
  console.log(allOk ? "\nToutes les portes sont vertes." : "\nAu moins une porte a échoué.");
  process.exit(allOk ? 0 : 1);
}

// ---------- dev ----------

const COLORS = { backend: "\x1b[36m", frontend: "\x1b[35m" }; // cyan / magenta
const RESET = "\x1b[0m";

/** Relaie stdout/stderr d'un enfant ligne par ligne, préfixé et coloré, sur le
 * flux `out` du process courant (au lieu de `stdio: "inherit"` qui mélangerait
 * les deux processus sans qu'on puisse distinguer qui a écrit quoi). */
function pipePrefixed(stream, label, out) {
  const color = COLORS[label] ?? "";
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      out.write(`${color}[${label}]${RESET} ${buf.slice(0, idx)}\n`);
      buf = buf.slice(idx + 1);
    }
  });
  stream.on("close", () => {
    if (buf.length) out.write(`${color}[${label}]${RESET} ${buf}\n`);
  });
}

/** Lance `cmd` en tâche de fond (long-running), sortie préfixée/colorée.
 * `detached: true` : le process a son propre groupe, pour pouvoir tuer TOUT
 * le sous-arbre (utile avec `cargo watch`, qui relance son propre enfant
 * compilé — un simple `child.kill()` ne toucherait que `cargo-watch` lui-même
 * et laisserait le serveur tourner, port bloqué). Cf. `shutdown()` dans `dev()`. */
function spawnDev(label, cmd, cmdArgs, cwd) {
  const child = spawn(cmd, cmdArgs, { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true });
  pipePrefixed(child.stdout, label, process.stdout);
  pipePrefixed(child.stderr, label, process.stderr);
  return child;
}

/** `docker compose up -d --wait` (db) dans backend/ — étape partagée par `dev`
 * et `seed`. Quitte le process si ça échoue. */
function ensureDbUp() {
  console.log("▶ docker compose up -d --wait (db)");
  const db = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });
  if (db.status !== 0) {
    console.error("✖ impossible de démarrer Postgres (docker compose) — abandon.");
    process.exit(1);
  }
}

/** `cargo run --bin pinkctl -- <args>` — one-shot, synchrone, sortie inhérite
 * directement (pas de long-running ici, pas besoin de préfixer). */
function runPinkctl(pinkctlArgs) {
  console.log(`▶ pinkctl ${pinkctlArgs.join(" ")}`);
  const result = spawnSync("cargo", ["run", "--bin", "pinkctl", "--", ...pinkctlArgs], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`✖ pinkctl ${pinkctlArgs.join(" ")} a échoué.`);
    process.exit(result.status ?? 1);
  }
}

function seed() {
  ensureDbUp();
  runPinkctl(["seed-demo"]);
}

/** `true` si le binaire cargo-watch est installé (`cargo install cargo-watch`). */
function hasCargoWatch() {
  const result = spawnSync("cargo-watch", ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function dev(withSeed) {
  ensureDbUp();
  if (withSeed) runPinkctl(["seed-demo"]);

  // Le frontend a le hot-reload natif de Vite ; le backend Rust non — on
  // utilise `cargo-watch` (recompile+relance à chaque changement de src/)
  // s'il est installé, sinon simple `cargo run` (pas de reload automatique).
  const watch = hasCargoWatch();
  const backendCmd = watch ? ["watch", "-x", "run"] : ["run"];
  if (!watch) {
    console.log(
      "ℹ cargo-watch non installé → pas de hot-reload backend " +
        "(`cargo install cargo-watch` pour l'activer, puis relancer `dev`).",
    );
  }

  console.log(
    `▶ cargo ${backendCmd.join(" ")} (backend) + npm run dev (frontend) — Ctrl+C pour tout arrêter\n`,
  );
  const children = {
    backend: spawnDev("backend", "cargo", backendCmd, BACKEND_DIR),
    frontend: spawnDev("frontend", "npm", ["run", "dev"], FRONTEND_DIR),
  };

  let shuttingDown = false;
  function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of Object.values(children)) {
      try {
        // PID négatif = tout le groupe (le process ET ses enfants — cargo-watch
        // relance un enfant compilé à part, cf. `spawnDev`).
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // déjà mort — rien à faire.
      }
    }
    // La DB (docker) reste up : redémarrer `pinkdev dev` doit rester rapide,
    // et un `docker compose up -d` réutilise le conteneur existant.
    process.exit(exitCode);
  }

  for (const [label, child] of Object.entries(children)) {
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.log(`\n${COLORS[label]}[${label}]${RESET} arrêté (${signal ?? `code ${code}`}) — arrêt de l'autre aussi.`);
      shutdown(code ?? 1);
    });
  }
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

// ---------- docker (build + run les vraies images, depuis le code local) ----------

// SHA du commit courant, passé aux builds d'images (APP_COMMIT → Réglages → À
// propos, `pinkctl version`, GET /api/version). Vide si git est indisponible.
function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: DEPLOY_DIR, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

function composeRun(extraArgs, label) {
  console.log(`▶ docker ${[...COMPOSE_ARGS, ...extraArgs].join(" ")}`);
  const result = spawnSync("docker", [...COMPOSE_ARGS, ...extraArgs], {
    cwd: DEPLOY_DIR,
    stdio: "inherit",
    env: { ...process.env, APP_COMMIT: process.env.APP_COMMIT ?? gitHead() },
  });
  if (result.status !== 0) {
    console.error(`✖ ${label} a échoué.`);
    process.exit(result.status ?? 1);
  }
}

function dockerPackage() {
  composeRun(["build"], "build des images Docker");
  console.log("\nImages construites : pinkphone-api:local, pinkphone-web:local");
}

function dockerRun(down) {
  if (down) {
    composeRun(["down"], "arrêt de la stack Docker");
    return;
  }
  composeRun(["up", "-d", "--build", "--wait"], "build + lancement de la stack Docker");
  console.log("\nStack lancée : http://localhost:8095 (web) — logs : docker compose -f deploy/docker-compose.local.yml logs -f");
}

// ---------- clean ----------

function rmIfExists(path) {
  if (existsSync(path)) {
    console.log(`  suppression : ${path}`);
    rmSync(path, { recursive: true, force: true });
  }
}

/** Supprime les artefacts de build 100% reproductibles (aucune perte de
 * données réelle — contrairement à `pinkctl nuke`) : pas de confirmation
 * nécessaire. `--volumes` va plus loin et vide aussi la DB locale, donc
 * demande explicitement le flag (pas un défaut silencieux). */
function clean(withVolumes) {
  console.log("▶ suppression des artefacts de build (node_modules, target, dist, storybook-static, coverage)");
  rmIfExists(resolve(FRONTEND_DIR, "node_modules"));
  rmIfExists(resolve(FRONTEND_DIR, "dist"));
  rmIfExists(resolve(FRONTEND_DIR, "storybook-static"));
  rmIfExists(resolve(FRONTEND_DIR, "coverage"));
  rmIfExists(resolve(BACKEND_DIR, "target"));

  const volFlag = withVolumes ? ["-v"] : [];
  console.log(
    `\n▶ arrêt des stacks Docker${withVolumes ? " (+ volumes : la base de données locale sera vidée)" : ""}`,
  );
  spawnSync("docker", ["compose", "down", ...volFlag], { cwd: BACKEND_DIR, stdio: "inherit" });
  spawnSync("docker", [...COMPOSE_ARGS, "down", ...volFlag], { cwd: DEPLOY_DIR, stdio: "inherit" });

  console.log(
    withVolumes
      ? "\nNettoyage complet (build + données locales)."
      : "\nNettoyage terminé (images Docker et volumes conservés — relance avec --volumes pour tout vider).",
  );
}

// ---------- screenshots / og (alias des scripts npm existants) ----------

function passthroughNpm(script) {
  const result = spawnSync("npm", ["run", script], { cwd: FRONTEND_DIR, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

// ---------- dispatch ----------

switch (command) {
  case "new-component":
    scaffold("component", args[0]);
    break;
  case "new-screen":
    scaffold("screen", args[0]);
    break;
  case "check":
    check(args.includes("--integration"));
    break;
  case "dev":
    dev(args.includes("--seed"));
    break;
  case "seed":
    seed();
    break;
  case "package":
    dockerPackage();
    break;
  case "docker":
    dockerRun(args.includes("--down"));
    break;
  case "clean":
    clean(args.includes("--volumes"));
    break;
  case "screenshots":
    passthroughNpm("screenshots");
    break;
  case "og":
    passthroughNpm("og");
    break;
  default:
    usageAndExit(command ? 1 : 0);
}
