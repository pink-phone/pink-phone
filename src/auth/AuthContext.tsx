import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api/client";
import type { UserPublic } from "../api/types";

const TOKEN_KEY = "pp_token";

interface AuthContextValue {
  user: UserPublic | null;
  /** true tant qu'on vérifie un éventuel jeton persistant au démarrage. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  // Au démarrage : token d'un callback OIDC (#token=...) sinon token stocké.
  useEffect(() => {
    const hash = window.location.hash;
    let token = localStorage.getItem(TOKEN_KEY);

    if (hash.startsWith("#token=")) {
      token = decodeURIComponent(hash.slice("#token=".length));
      localStorage.setItem(TOKEN_KEY, token);
    }
    // Nettoie le fragment (token ou #error=oidc) de l'URL.
    if (hash.startsWith("#token=") || hash.startsWith("#error=")) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }

    if (!token) {
      setLoading(false);
      return;
    }
    api.setToken(token);
    api
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        api.setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((token: string, u: UserPublic) => {
    localStorage.setItem(TOKEN_KEY, token);
    api.setToken(token);
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
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
