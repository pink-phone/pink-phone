import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LockScreen } from "../components/LockScreen/LockScreen";
import { isPinSet, verifyPin, PIN_LENGTH } from "../lib/pin";

/**
 * Verrou local : si un code PIN est configuré, l'app démarre verrouillée (donc
 * verrouillée à chaque réouverture / rechargement) et se re-verrouille dès qu'elle
 * passe en arrière-plan. Tant qu'aucun code n'est défini, c'est transparent.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(() => isPinSet());
  const [error, setError] = useState<string | null>(null);

  // Re-verrouille quand l'app part en arrière-plan → code requis au retour.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && isPinSet()) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const submit = useCallback(
    async (pin: string) => {
      if (await verifyPin(pin)) {
        setError(null);
        setLocked(false);
      } else {
        setError(t("lock.wrong"));
      }
    },
    [t],
  );

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal-900 bg-felt-velvet px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <LockScreen
        title={t("lock.title")}
        subtitle={t("lock.subtitle")}
        error={error}
        pinLength={PIN_LENGTH}
        onSubmit={submit}
      />
    </div>
  );
}
