import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const auth = vi.hoisted(() => ({
  state: { user: null as unknown, loading: false, login: vi.fn(), register: vi.fn() },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth.state }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getAuthConfig: vi.fn(),
  oidcLoginUrl: () => "http://api/oidc",
}));
vi.mock("./SpaceGate", () => ({ SpaceGate: () => <div>space-gate</div> }));
vi.mock("../screens/Splash/Splash", () => ({ Splash: () => <div>splash</div> }));
vi.mock("../screens/AuthScreen/AuthScreen", () => ({
  AuthScreen: (p: {
    error: string | null;
    busy: boolean;
    passwordEnabled: boolean;
    oidcEnabled: boolean;
    onSubmit: (m: string, d: object) => Promise<void>;
    onOidcLogin: () => void;
  }) => (
    <div>
      <span data-testid="err">{p.error}</span>
      <span data-testid="cfg">{`${p.passwordEnabled}-${p.oidcEnabled}`}</span>
      <button onClick={() => void p.onSubmit("login", { email: "a", displayName: "", password: "p" })}>login</button>
      <button onClick={() => void p.onSubmit("register", { email: "a", displayName: "N", password: "p" })}>register</button>
      <button onClick={p.onOidcLogin}>sso</button>
    </div>
  ),
}));

import * as api from "../api/client";
import { ApiError } from "../api/client";
import { Root } from "./Root";

const getAuthConfig = vi.mocked(api.getAuthConfig);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  auth.state = { user: null, loading: false, login: vi.fn(), register: vi.fn() };
  getAuthConfig.mockResolvedValue({ passwordEnabled: true, oidcEnabled: true });
});

describe("Root", () => {
  it("Splash tant que l'auth charge", () => {
    auth.state.loading = true;
    render(<Root />);
    expect(screen.getByText("splash")).toBeInTheDocument();
  });

  it("Splash puis écran d'auth avec la config serveur", async () => {
    getAuthConfig.mockResolvedValue({ passwordEnabled: false, oidcEnabled: true });
    render(<Root />);
    expect(screen.getByText("splash")).toBeInTheDocument();
    expect(await screen.findByTestId("cfg")).toHaveTextContent("false-true");
  });

  it("serveur injoignable : repli mot de passe + message d'erreur", async () => {
    getAuthConfig.mockRejectedValue(new Error("down"));
    render(<Root />);
    expect(await screen.findByTestId("cfg")).toHaveTextContent("true-false");
    expect(screen.getByTestId("err")).not.toBeEmptyDOMElement();
  });

  it("signale un échec SSO (#error=oidc)", async () => {
    window.history.replaceState(null, "", "/#error=oidc");
    render(<Root />);
    await screen.findByTestId("cfg");
    expect(screen.getByTestId("err")).not.toBeEmptyDOMElement();
  });

  it("login et register délèguent au contexte", async () => {
    render(<Root />);
    await userEvent.click(await screen.findByText("login"));
    expect(auth.state.login).toHaveBeenCalledWith("a", "p");
    await userEvent.click(screen.getByText("register"));
    expect(auth.state.register).toHaveBeenCalledWith("a", "N", "p");
  });

  it("affiche le message d'une ApiError, un message générique sinon", async () => {
    render(<Root />);
    auth.state.login.mockRejectedValueOnce(new ApiError(401, "mauvais mot de passe"));
    await userEvent.click(await screen.findByText("login"));
    await waitFor(() => expect(screen.getByTestId("err")).toHaveTextContent("mauvais mot de passe"));
    auth.state.login.mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("err")).not.toHaveTextContent("mauvais mot de passe"));
    expect(screen.getByTestId("err")).not.toBeEmptyDOMElement();
  });

  it("utilisateur connecté → SpaceGate, sans charger la config", () => {
    auth.state.user = { id: "u" };
    render(<Root />);
    expect(screen.getByText("space-gate")).toBeInTheDocument();
    expect(getAuthConfig).not.toHaveBeenCalled();
  });
});
