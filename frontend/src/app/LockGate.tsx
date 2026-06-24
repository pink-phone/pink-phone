import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { LockScreen } from "../components/LockScreen/LockScreen";
import { isPinSet, verifyPin, PIN_LENGTH } from "../lib/pin";
import { isBiometricEnabled, verifyBiometric } from "../lib/biometric";

/**
 * Verrou local : si un code PIN est configuré, l'app démarre verrouillée (donc
 * verrouillée à chaque réouverture / rechargement) et se re-verrouille dès qu'elle
 * passe en arrière-plan. Tant qu'aucun code n'est défini, c'est transparent.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(() => isPinSet());
  const [error, setError] = useState<string | null>(null);
  const [bioEnabled] = useState(() => isBiometricEnabled());
  // Garde contre les déclenchements multiples de la biométrie pour un même verrou.
  const bioTried = useRef(false);

  // Re-verrouille quand l'app part en arrière-plan → code requis au retour.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && isPinSet()) {
        setLocked(true);
        bioTried.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const tryBiometric = useCallback(async () => {
    if (await verifyBiometric()) {
      setError(null);
      setLocked(false);
    }
    // Échec/refus/annulation : on reste verrouillé, le PIN prend le relais.
  }, []);

  // Tente la biométrie automatiquement à chaque verrouillage (façon déverrouillage
  // d'app bancaire). Le prompt OS s'affiche ; en cas d'échec le pavé PIN reste.
  useEffect(() => {
    if (locked && bioEnabled && !bioTried.current) {
      bioTried.current = true;
      void tryBiometric();
    }
  }, [locked, bioEnabled, tryBiometric]);

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
        onBiometric={bioEnabled ? () => void tryBiometric() : undefined}
      />
    </div>
  );
}
