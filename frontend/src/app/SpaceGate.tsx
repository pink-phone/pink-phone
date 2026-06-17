import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { Space, UserPublic } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { OnboardingScreen } from "../screens/OnboardingScreen/OnboardingScreen";
import { Splash } from "../screens/Splash/Splash";
import { SpaceApp } from "./SpaceApp";

/** Aiguille vers l'onboarding (aucun espace) ou l'app (espace existant). */
export function SpaceGate({ user }: { user: UserPublic }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const msg = (e: unknown) =>
    e instanceof ApiError ? e.message : t("errors.generic");
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .mySpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, []);

  if (spaces === null) return <Splash message={t("splash.loadingSpace")} />;

  if (spaces.length === 0) {
    const onCreate = async (name: string) => {
      setBusy(true);
      setError(null);
      try {
        setSpaces([await api.createSpace(name)]);
      } catch (e) {
        setError(msg(e));
      } finally {
        setBusy(false);
      }
    };
    const onJoin = async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        setSpaces([await api.joinSpace(id)]);
      } catch (e) {
        setError(msg(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <OnboardingScreen
        userName={user.displayName}
        onCreate={onCreate}
        onJoin={onJoin}
        onLogout={logout}
        error={error}
        busy={busy}
      />
    );
  }

  return <SpaceApp space={spaces[0]} user={user} />;
}
