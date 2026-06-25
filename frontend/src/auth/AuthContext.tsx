import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api/client";
import type { UserPublic } from "../api/types";

const TOKEN_KEY = "pp_token";

interface AuthContextValue {
  user: UserPublic | null;
  /** Jeton JWT courant (pour les usages hors client `fetch`, ex. URL WebSocket). */
  token: string | null;
  /** true tant qu'on vérifie un éventuel jeton persistant au démarrage. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  /** Change le nom affiché du compte (PATCH /me) et met à jour l'état local. */
  updateDisplayName: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Au démarrage : code d'un callback OIDC (#code=…) échangé contre le JWT, sinon
  // jeton déjà stocké.
  useEffect(() => {
    const hash = window.location.hash;

    // Nettoie le fragment (#code= / #error=oidc) pour ne pas le laisser dans l'URL.
    const cleanHash = () => {
      if (hash.startsWith("#code=") || hash.startsWith("#error=")) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    };

    const adopt = (token: string) => {
      localStorage.setItem(TOKEN_KEY, token);
      api.setToken(token);
      setTokenState(token);
      return api.me().then(setUser);
    };
    const drop = () => {
      localStorage.removeItem(TOKEN_KEY);
      api.setToken(null);
      setTokenState(null);
    };

    // Callback OIDC : on échange le code éphémère contre le JWT (le jeton ne
    // transite jamais par l'URL — SEC-006).
    if (hash.startsWith("#code=")) {
      const code = decodeURIComponent(hash.slice("#code=".length));
      cleanHash();
      api
        .oidcExchange(code)
        .then(({ token }) => adopt(token))
        .catch(drop)
        .finally(() => setLoading(false));
      return;
    }

    cleanHash(); // nettoie un éventuel #error=oidc

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    api.setToken(token);
    setTokenState(token);
    api
      .me()
      .then(setUser)
      .catch(drop)
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((token: string, u: UserPublic) => {
    localStorage.setItem(TOKEN_KEY, token);
    api.setToken(token);
    setTokenState(token);
    setUser(u);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      persist(res.token, res.user);
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, displayName: string, password: string) => {
      const res = await api.register(email, displayName, password);
      persist(res.token, res.user);
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  // Met à jour le nom affiché du compte (après PATCH /me). Pas d'appel réseau ici :
  // l'orchestration appelle `api.updateMe` puis nous passe l'utilisateur à jour.
  const updateDisplayName = useCallback(async (displayName: string) => {
    const u = await api.updateMe(displayName);
    setUser(u);
  }, []);

  // Valeur mémoïsée (REACT-13) : ne change de référence que sur une transition
  // d'auth réelle, pas à chaque rendu du provider → pas de re-render inutile des
  // consommateurs (`login`/`register`/`logout` sont stables via useCallback).
  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, updateDisplayName }),
    [user, token, loading, login, register, logout, updateDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
