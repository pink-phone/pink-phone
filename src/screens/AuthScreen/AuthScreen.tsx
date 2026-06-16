import { useState } from "react";
import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { TextField } from "../../components/form/TextField";

export type AuthMode = "login" | "register";

export interface AuthSubmit {
  email: string;
  displayName: string;
  password: string;
}

export interface AuthScreenProps {
  onSubmit: (mode: AuthMode, data: AuthSubmit) => void;
  /** Connexion email/mot de passe disponible. */
  passwordEnabled?: boolean;
  /** SSO (OIDC) disponible. */
  oidcEnabled?: boolean;
  onOidcLogin?: () => void;
  error?: string | null;
  busy?: boolean;
}

/** Écran d'entrée : connexion / création de compte et/ou SSO. */
export function AuthScreen({
  onSubmit,
  passwordEnabled = true,
  oidcEnabled = false,
  onOidcLogin,
  error,
  busy,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";
  const canSubmit =
    email.trim() !== "" &&
    password.length >= 8 &&
    (!isRegister || displayName.trim() !== "");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Surface tone="velvet" className="w-full max-w-sm space-y-5">
        <header className="text-center">
          <h1 className="font-serif text-3xl text-blush-100">Pink Phone</h1>
          <p className="mt-1 text-sm text-taupe-300">
            {!passwordEnabled
              ? "Connectez-vous pour entrer."
              : isRegister
                ? "Créez votre nid."
                : "Bon retour parmi nous."}
          </p>
        </header>

        {oidcEnabled && (
          <div className="space-y-3">
            <Button
              type="button"
              variant={passwordEnabled ? "secondary" : "primary"}
              className="w-full"
              onClick={onOidcLogin}
            >
              🔐 Se connecter avec le SSO
            </Button>
            {passwordEnabled && (
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-taupe-400">
                <span className="h-px flex-1 bg-charcoal-600/60" />
                ou
                <span className="h-px flex-1 bg-charcoal-600/60" />
              </div>
            )}
          </div>
        )}

        {error && !passwordEnabled && (
          <p className="rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-center text-xs text-blush-200">
            {error}
          </p>
        )}

        {passwordEnabled && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && !busy)
              onSubmit(mode, { email: email.trim(), displayName: displayName.trim(), password });
          }}
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
          />
          {isRegister && (
            <TextField
              label="Ton prénom"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alex"
            />
          )}
          <TextField
            label="Mot de passe"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={isRegister ? "8 caractères minimum." : undefined}
          />

          {error && (
            <p className="rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-xs text-blush-200">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit || busy}>
            {busy ? "…" : isRegister ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>
        )}

        {passwordEnabled && (
          <button
            type="button"
            onClick={() => setMode(isRegister ? "login" : "register")}
            className="block w-full text-center text-xs text-taupe-400 transition-colors duration-300 ease-felt hover:text-spice-300"
          >
            {isRegister
              ? "Déjà un compte ? Se connecter"
              : "Pas encore de compte ? En créer un"}
          </button>
        )}
      </Surface>
    </main>
  );
}
