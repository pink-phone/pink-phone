import { AuthProvider } from "./auth/AuthContext";
import { Root } from "./app/Root";
import { InstallPrompt } from "./app/InstallPrompt";
import { LockGate } from "./app/LockGate";

/**
 * Racine de l'app : verrou local optionnel (PIN) → auth → onboarding → espace.
 * Toutes les briques visuelles proviennent de composants validés dans Storybook.
 */
export function App() {
  return (
    <AuthProvider>
      <LockGate>
        <Root />
        <InstallPrompt />
      </LockGate>
    </AuthProvider>
  );
}
