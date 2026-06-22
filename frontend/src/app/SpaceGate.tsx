import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { Space, UserPublic } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { OnboardingScreen } from "../screens/OnboardingScreen/OnboardingScreen";
import { Splash } from "../screens/Splash/Splash";
import { SpaceApp } from "./SpaceApp";
import { CURRENT_SPACE_KEY, pickCurrentSpace } from "./currentSpace";

/**
 * Aiguille vers l'onboarding (aucun salon) ou l'app (salon courant). Gère le
 * multi-space (#67) : liste des salons de l'utilisateur, salon courant persisté,
 * bascule + création/jointure d'un autre salon. `SpaceApp` est monté avec une
 * `key` = id du salon courant → tout son état se réinitialise à la bascule.
 */
export function SpaceGate({ user }: { user: UserPublic }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const msg = (e: unknown) =>
    e instanceof ApiError ? e.message : t("errors.generic");
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(() =>
    localStorage.getItem(CURRENT_SPACE_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .mySpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, []);

  const switchSpace = (id: string) => {
    setCurrentId(id);
    localStorage.setItem(CURRENT_SPACE_KEY, id);
  };

  if (spaces === null) return <Splash message={t("splash.loadingSpace")} />;

  if (spaces.length === 0) {
    const onCreate = async (name: string) => {
      setBusy(true);
      setError(null);
      try {
        const s = await api.createSpace(name);
        setSpaces([s]);
        switchSpace(s.id);
      } catch (e) {
        setError(msg(e));
      } finally {
        setBusy(false);
      }
    };
    const onJoin = async (token: string) => {
      setBusy(true);
      setError(null);
      try {
        const s = await api.joinByInvite(token.trim());
        setSpaces([s]);
        switchSpace(s.id);
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

  // Salon courant : celui mémorisé s'il existe encore, sinon le premier.
  const current = pickCurrentSpace(spaces, currentId) ?? spaces[0];

  // Créer / rejoindre un AUTRE salon depuis l'app (Réglages). On bascule dessus.
  const createSpace = async (name: string) => {
    const s = await api.createSpace(name);
    setSpaces((prev) => [...(prev ?? []), s]);
    switchSpace(s.id);
  };
  const joinSpace = async (token: string) => {
    const s = await api.joinByInvite(token.trim());
    setSpaces((prev) =>
      prev?.some((x) => x.id === s.id) ? prev : [...(prev ?? []), s],
    );
    switchSpace(s.id);
  };

  return (
    <SpaceApp
      key={current.id}
      space={current}
      spaces={spaces}
      user={user}
      onSwitchSpace={switchSpace}
      onCreateSpace={createSpace}
      onJoinSpace={joinSpace}
    />
  );
}
