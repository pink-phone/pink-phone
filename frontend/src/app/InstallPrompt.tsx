import { useEffect, useState } from "react";
import { InstallBanner } from "../components/InstallBanner/InstallBanner";

const DISMISS_KEY = "pp_install_dismissed";

// L'événement Chromium (non typé par lib.dom).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Invite à installer la PWA. Sur Android/Chromium, capte `beforeinstallprompt`
 * et déclenche le prompt natif. Sur iOS Safari (sans prompt), affiche les
 * instructions. Masquée si déjà installée ou déjà refusée.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS n'émet pas l'événement : on propose les instructions après un délai.
    let timer: number | undefined;
    if (isIos()) {
      timer = window.setTimeout(() => setMode("ios"), 2500);
    }

    const onInstalled = () => {
      setMode(null);
      localStorage.setItem(DISMISS_KEY, "1");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setMode(null);
  };

  return <InstallBanner mode={mode} onInstall={install} onDismiss={dismiss} />;
}
