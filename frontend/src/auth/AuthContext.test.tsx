import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("../api/client", () => ({
  setToken: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  updateMe: vi.fn(),
  oidcExchange: vi.fn(),
}));

import * as api from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";

const user = { id: "u1", email: "a@b.c", displayName: "Ana" } as never;
const mocked = vi.mocked(api);

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useAuth", () => {
  it("lève hors AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});

describe("AuthProvider — démarrage", () => {
  it("sans jeton stocké : fin du chargement, pas d'utilisateur", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(mocked.me).not.toHaveBeenCalled();
  });

  it("avec un jeton stocké : charge l'utilisateur", async () => {
    localStorage.setItem("pp_token", "tok");
    mocked.me.mockResolvedValue(user);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked.setToken).toHaveBeenCalledWith("tok");
    expect(result.current.user).toBe(user);
    expect(result.current.token).toBe("tok");
  });

  it("jeton invalide : on le purge", async () => {
    localStorage.setItem("pp_token", "vieux");
    mocked.me.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
    expect(mocked.setToken).toHaveBeenLastCalledWith(null);
  });

  it("callback OIDC : échange le code, adopte le jeton, nettoie l'URL", async () => {
    window.history.replaceState(null, "", "/app?x=1#code=abc%20def");
    mocked.oidcExchange.mockResolvedValue({ token: "jwt" });
    mocked.me.mockResolvedValue(user);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked.oidcExchange).toHaveBeenCalledWith("abc def");
    expect(localStorage.getItem("pp_token")).toBe("jwt");
    expect(result.current.user).toBe(user);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/app?x=1");
  });

  it("callback OIDC en échec : pas de session", async () => {
    window.history.replaceState(null, "", "/#code=zzz");
    mocked.oidcExchange.mockRejectedValue(new Error("expiré"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
  });

  it("nettoie un fragment #error=oidc", async () => {
    window.history.replaceState(null, "", "/#error=oidc");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(window.location.hash).toBe("");
  });
});

describe("AuthProvider — actions", () => {
  async function ready() {
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it("login persiste jeton + utilisateur", async () => {
    mocked.login.mockResolvedValue({ token: "t1", user });
    const { result } = await ready();
    await act(() => result.current.login("a@b.c", "pw"));
    expect(result.current.user).toBe(user);
    expect(result.current.token).toBe("t1");
    expect(localStorage.getItem("pp_token")).toBe("t1");
    expect(mocked.setToken).toHaveBeenLastCalledWith("t1");
  });

  it("register persiste jeton + utilisateur", async () => {
    mocked.register.mockResolvedValue({ token: "t2", user });
    const { result } = await ready();
    await act(() => result.current.register("a@b.c", "Ana", "pw"));
    expect(mocked.register).toHaveBeenCalledWith("a@b.c", "Ana", "pw");
    expect(result.current.token).toBe("t2");
  });

  it("logout vide la session", async () => {
    mocked.login.mockResolvedValue({ token: "t1", user });
    const { result } = await ready();
    await act(() => result.current.login("a@b.c", "pw"));
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
  });

  it("updateDisplayName met à jour l'utilisateur local", async () => {
    const updated = { ...(user as object), displayName: "Nouveau" } as never;
    mocked.updateMe.mockResolvedValue(updated);
    const { result } = await ready();
    await act(() => result.current.updateDisplayName("Nouveau"));
    expect(mocked.updateMe).toHaveBeenCalledWith("Nouveau");
    expect(result.current.user).toBe(updated);
  });
});
