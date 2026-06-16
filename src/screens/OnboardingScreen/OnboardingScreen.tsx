import { useState } from "react";
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
  const [name, setName] = useState("Pink Phone");
  const [joinId, setJoinId] = useState("");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6">
      <header className="text-center">
        <h1 className="font-serif text-2xl text-blush-100">
          {userName ? `Bienvenue, ${userName}` : "Bienvenue"}
        </h1>
        <p className="mt-1 text-sm text-taupe-300">
          Créez votre espace, ou rejoignez celui de l'autre.
        </p>
      </header>

      <Surface tone="velvet" className="w-full max-w-sm space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">Créer un espace</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) onCreate(name.trim());
          }}
        >
          <TextField
            label="Nom de l'espace"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
            Créer
          </Button>
        </form>
      </Surface>

      <Surface tone="velvet" className="w-full max-w-sm space-y-3">
        <h2 className="font-serif text-lg text-taupe-100">Rejoindre un espace</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinId.trim() && !busy) onJoin(joinId.trim());
          }}
        >
          <TextField
            label="Identifiant de l'espace"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="collez l'id partagé par votre partenaire"
            hint="Votre partenaire le trouve dans les réglages de l'espace."
          />
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={!joinId.trim() || busy}
          >
            Rejoindre
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
          Se déconnecter
        </button>
      )}
    </main>
  );
}
