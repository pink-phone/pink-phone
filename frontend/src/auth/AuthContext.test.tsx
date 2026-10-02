import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("../api/client");
const a = vi.mocked(api, true);

const USER = { id: "u1", email: "a@x.test", displayName: "Alex", createdAt: "2026-01-01T00:00:00Z" };
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("AuthProvider — démarrage", () => {
  it("sans jeton : pas connecté, plus en chargement, aucun appel réseau", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(a.me).not.toHaveBeenCalled();
  });

  it("jeton stocké valide : restaure la session via /me", async () => {
    localStorage.setItem("pp_token", "tok");
    a.me.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(USER));
    expect(a.setToken).toHaveBeenCalledWith("tok");
    expect(result.current.token).toBe("tok");
    expect(result.current.loading).toBe(false);
  });

  it("jeton stocké refusé par l'API : il est oublié", async () => {
    localStorage.setItem("pp_token", "perime");
    a.me.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
    expect(a.setToken).toHaveBeenLastCalledWith(null);
  });

  it("callback OIDC (#code=…) : échange le code, nettoie l'URL, ouvre la session", async () => {
    window.history.replaceState(null, "", "/#code=abc%20def");
    a.oidcExchange.mockResolvedValue({ token: "jwt" });
    a.me.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(USER));
    expect(a.oidcExchange).toHaveBeenCalledWith("abc def");
    expect(localStorage.getItem("pp_token")).toBe("jwt");
    expect(window.location.hash).toBe("");
  });

  it("callback OIDC dont l'échange échoue : pas de session", async () => {
    window.history.replaceState(null, "", "/#code=zzz");
    a.oidcExchange.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
  });

  it("#error=oidc : fragment nettoyé, pas de session", async () => {
    window.history.replaceState(null, "", "/#error=oidc");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(window.location.hash).toBe("");
    expect(result.current.user).toBeNull();
  });
});

describe("AuthProvider — actions", () => {
  async function ready() {
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it("login : persiste le jeton et l'utilisateur", async () => {
    a.login.mockResolvedValue({ token: "t1", user: USER });
    const { result } = await ready();
    await act(() => result.current.login("a@x.test", "motdepasse"));
    expect(a.login).toHaveBeenCalledWith("a@x.test", "motdepasse");
    expect(result.current.user).toEqual(USER);
    expect(localStorage.getItem("pp_token")).toBe("t1");
    expect(a.setToken).toHaveBeenLastCalledWith("t1");
  });

  it("register : persiste le jeton et l'utilisateur", async () => {
    a.register.mockResolvedValue({ token: "t2", user: USER });
    const { result } = await ready();
    await act(() => result.current.register("a@x.test", "Alex", "motdepasse"));
    expect(a.register).toHaveBeenCalledWith("a@x.test", "Alex", "motdepasse");
    expect(result.current.token).toBe("t2");
  });

  it("login refusé : l'erreur remonte et rien n'est persisté", async () => {
    a.login.mockRejectedValue(new Error("identifiants invalides"));
    const { result } = await ready();
    await expect(
      act(() => result.current.login("a@x.test", "mauvais")),
    ).rejects.toThrow("identifiants invalides");
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
  });

  it("logout : oublie le jeton, l'utilisateur et les brouillons en clair", async () => {
    a.login.mockResolvedValue({ token: "t1", user: USER });
    localStorage.setItem("pp_post_draft:s1", "texte intime");
    const { result } = await ready();
    await act(() => result.current.login("a@x.test", "motdepasse"));
    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("pp_token")).toBeNull();
    expect(a.setToken).toHaveBeenLastCalledWith(null);
  });

  it("updateDisplayName : met à jour l'utilisateur avec la réponse de l'API", async () => {
    a.login.mockResolvedValue({ token: "t1", user: USER });
    a.updateMe.mockResolvedValue({ ...USER, displayName: "Alexandre" });
    const { result } = await ready();
    await act(() => result.current.login("a@x.test", "motdepasse"));
    await act(() => result.current.updateDisplayName("Alexandre"));
    expect(a.updateMe).toHaveBeenCalledWith("Alexandre");
    expect(result.current.user?.displayName).toBe("Alexandre");
  });
});

describe("useAuth", () => {
  it("hors AuthProvider : erreur explicite", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});
