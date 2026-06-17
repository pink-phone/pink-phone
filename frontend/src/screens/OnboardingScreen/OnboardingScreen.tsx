import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { TextField } from "../../components/form/TextField";

export interface OnboardingScreenProps {
  userName?: string;
  onCreate: (name: string) => void;
  onJoin: (spaceId: string) => void;
  onLogout?: () => void;
  error?: string | null;
  busy?: boolean;
}

/** Première connexion : créer son espace ou rejoindre celui du/de la partenaire. */
export function OnboardingScreen({
  userName,
  onCreate,
  onJoin,
  onLogout,
  error,
  busy,
}: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("Pink Phone");
  const [joinId, setJoinId] = useState("");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6">
      <header className="text-center">
        <h1 className="font-serif text-2xl text-blush-100">
          {userName ? t("onboarding.welcomeName", { name: userName }) : t("onboarding.welcome")}
        </h1>
        <p className="mt-1 text-sm text-taupe-300">{t("onboarding.subtitle")}</p>
      </header>

      <Surface tone="velvet" className="w-full max-w-sm space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">
          {t("onboarding.createTitle")}
        </h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) onCreate(name.trim());
          }}
        >
          <TextField
            label={t("onboarding.spaceNameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
            {t("onboarding.create")}
          </Button>
        </form>
      </Surface>

      <Surface tone="velvet" className="w-full max-w-sm space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">
          {t("onboarding.joinTitle")}
        </h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinId.trim() && !busy) onJoin(joinId.trim());
          }}
        >
          <TextField
            label={t("onboarding.spaceIdLabel")}
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder={t("onboarding.joinPlaceholder")}
            hint={t("onboarding.joinHint")}
          />
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={!joinId.trim() || busy}
          >
            {t("onboarding.join")}
          </Button>
        </form>
      </Surface>

      {error && (
        <p className="max-w-sm rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-center text-xs text-blush-200">
          {error}
        </p>
      )}

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="text-xs text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
        >
          {t("common.logout")}
        </button>
      )}
    </main>
  );
}
