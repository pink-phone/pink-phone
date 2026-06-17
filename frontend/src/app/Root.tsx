import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { AuthConfig } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  AuthScreen,
  type AuthMode,
  type AuthSubmit,
} from "../screens/AuthScreen/AuthScreen";
import { Splash } from "../screens/Splash/Splash";
import { SpaceGate } from "./SpaceGate";

/** Aiguille selon l'état d'authentification. */
export function Root() {
  const { t } = useTranslation();
  const { user, loading, login, register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  // Méthodes d'auth disponibles (mot de passe / SSO).
  useEffect(() => {
    if (user) return;
    api
      .getAuthConfig()
      .then(setAuthConfig)
      .catch(() => {
        // L'API n'a pas répondu (après retries) : on dégrade vers le mot de passe,
        // mais on le signale au lieu de masquer le SSO en silence.
        setAuthConfig({ passwordEnabled: true, oidcEnabled: false });
        setError(t("errors.serverUnreachable"));
      });
  }, [user, t]);

  // Un callback OIDC est en cours de traitement (#error) ?
  useEffect(() => {
    if (window.location.hash.startsWith("#error=")) {
      setError(t("errors.ssoFailed"));
    }
  }, [t]);

  if (loading || (!user && !authConfig)) return <Splash />;

  if (!user) {
    const onSubmit = async (mode: AuthMode, d: AuthSubmit) => {
      setBusy(true);
      setError(null);
      try {
        if (mode === "login") await login(d.email, d.password);
        else await register(d.email, d.displayName, d.password);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t("errors.generic"));
      } finally {
        setBusy(false);
      }
    };
    return (
      <AuthScreen
        onSubmit={onSubmit}
        passwordEnabled={authConfig!.passwordEnabled}
        oidcEnabled={authConfig!.oidcEnabled}
        onOidcLogin={() => {
          window.location.href = api.oidcLoginUrl();
        }}
        error={error}
        busy={busy}
      />
    );
  }

  return <SpaceGate user={user} />;
}
