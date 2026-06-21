import { reportClientLogs, type ClientLogEntry } from "./api/client";

// Remontée best-effort des erreurs du front vers le backend (#56) : pratique
// pour déboguer à distance, surtout sur iOS où l'inspecteur est inaccessible.
// On ne capture que des diagnostics (message + contexte technique) — jamais le
// contenu intime des posts/médias. État device-local, hors couche SpaceApp
// (même exception que le thème / la langue / le verrou) : pas de Storybook.

let queue: ClientLogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const FLUSH_DELAY_MS = 3000;
const MAX_QUEUE = 50;

function flush() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  reportClientLogs(batch);
}

function enqueue(entry: ClientLogEntry) {
  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.shift();
  if (timer === undefined) {
    timer = setTimeout(flush, FLUSH_DELAY_MS);
  }
}

/** Signale une erreur applicative explicitement (depuis un `catch`). */
export function logClientError(message: string, context?: string) {
  enqueue({ level: "error", message, context });
}

/** Installe les capteurs globaux. À appeler une fois au démarrage de l'app. */
export function initClientLogging() {
  window.addEventListener("error", (e) => {
    enqueue({
      level: "error",
      message: e.message || "erreur inconnue",
      context: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as { message?: string } | string | undefined;
    const message =
      typeof reason === "string"
        ? reason
        : (reason?.message ?? "rejet de promesse non géré");
    enqueue({ level: "error", message, context: "unhandledrejection" });
  });

  // Vide la file avant que l'onglet ne parte (mobile : bascule d'app fréquente).
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
