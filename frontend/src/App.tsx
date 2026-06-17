import { AuthProvider } from "./auth/AuthContext";
import { Root } from "./app/Root";
import { InstallPrompt } from "./app/InstallPrompt";

/**
 * Racine de l'app : fournit l'auth puis aiguille (auth → onboarding → espace).
 * Toutes les briques visuelles proviennent de composants validés dans Storybook.
 */
export function App() {
  return (
    <AuthProvider>
      <Root />
      <InstallPrompt />
    </AuthProvider>
  );
}
