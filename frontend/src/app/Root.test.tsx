import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { Root } from "./Root";

vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getAuthConfig: vi.fn(),
  oidcLoginUrl: vi.fn(() => "http://api/oidc/login"),
}));
const auth = vi.hoisted(() => ({
  state: {
    user: null as null | { id: string; displayName: string },
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
  },
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth.state }));
// SpaceGate (et donc SpaceApp) est testé à part : ici on vérifie l'aiguillage.
vi.mock("./SpaceGate", () => ({
  SpaceGate: ({ user }: { user: { displayName: string } }) => (
    <div>gate:{user.displayName}</div>
  ),
}));

const a = vi.mocked(api, true);

beforeEach(() => {
  vi.clearAllMocks();
  auth.state.user = null;
  auth.state.loading = false;
  window.history.replaceState(null, "", "/");
  a.getAuthConfig.mockResolvedValue({ passwordEnabled: true, oidcEnabled: false });
});

async function fillAndSubmit() {
  await userEvent.type(await screen.findByLabelText("Email"), "toi@exemple.com");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "motdepasse");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

describe("Root", () => {
  it("affiche le splash tant que l'auth est en cours de chargement", () => {
    auth.state.loading = true;
    render(<Root />);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(a.getAuthConfig).toHaveBeenCalled();
  });

  it("utilisateur connecté : bascule sur SpaceGate sans charger la config d'auth", () => {
    auth.state.user = { id: "u1", displayName: "Alex" };
    render(<Root />);
    expect(screen.getByText("gate:Alex")).toBeInTheDocument();
    expect(a.getAuthConfig).not.toHaveBeenCalled();
  });

  it("non connecté : écran d'auth, la soumission appelle login", async () => {
    render(<Root />);
    await fillAndSubmit();
    expect(auth.state.login).toHaveBeenCalledWith("toi@exemple.com", "motdepasse");
  });

  it("affiche le message de l'API quand la connexion est refusée", async () => {
    auth.state.login.mockRejectedValue(new ApiError(401, "identifiants invalides"));
    render(<Root />);
    await fillAndSubmit();
    expect(await screen.findByText("identifiants invalides")).toBeInTheDocument();
  });

  it("affiche un message générique pour une erreur inattendue", async () => {
    auth.state.login.mockRejectedValue(new Error("boom"));
    render(<Root />);
    await fillAndSubmit();
    expect(await screen.findByText("une erreur est survenue")).toBeInTheDocument();
  });

  it("bascule en création de compte : appelle register avec le prénom", async () => {
    render(<Root />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Pas encore de compte/ }),
    );
    await userEvent.type(screen.getByLabelText("Ton prénom"), "Alex");
    await userEvent.type(screen.getByLabelText("Email"), "toi@exemple.com");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "motdepasse");
    await userEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
    expect(auth.state.register).toHaveBeenCalledWith(
      "toi@exemple.com",
      "Alex",
      "motdepasse",
    );
  });

  it("serveur injoignable : dégrade vers le mot de passe ET le signale", async () => {
    a.getAuthConfig.mockRejectedValue(new Error("réseau"));
    render(<Root />);
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText(/serveur|injoignable|joindre/i)).toBeInTheDocument();
  });

  it("retour d'un SSO en échec (#error=oidc) : erreur affichée", async () => {
    window.history.replaceState(null, "", "/#error=oidc");
    render(<Root />);
    expect(await screen.findByText("La connexion SSO a échoué. Réessaie.")).toBeInTheDocument();
  });

  it("SSO seul : le bouton SSO redirige vers l'URL de login OIDC", async () => {
    a.getAuthConfig.mockResolvedValue({ passwordEnabled: false, oidcEnabled: true });
    const loc = { href: "" };
    const spy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      get href() {
        return loc.href;
      },
      set href(v: string) {
        loc.href = v;
      },
    } as Location);
    render(<Root />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Se connecter avec le SSO/ }),
    );
    await waitFor(() => expect(loc.href).toBe("http://api/oidc/login"));
    spy.mockRestore();
  });
});
