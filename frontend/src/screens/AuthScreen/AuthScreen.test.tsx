import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("connexion : email + mot de passe (≥8) → onSubmit('login', …)", async () => {
    const onSubmit = vi.fn();
    render(<AuthScreen onSubmit={onSubmit} />);
    const submit = screen.getByRole("button", { name: "Se connecter" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "toi@exemple.com");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "motdepasse");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith("login", {
      email: "toi@exemple.com",
      displayName: "",
      password: "motdepasse",
    });
  });

  it("bascule en création : champ prénom requis + bouton « Créer mon compte »", async () => {
    render(<AuthScreen onSubmit={vi.fn()} />);
    // En login, pas de prénom.
    expect(screen.queryByLabelText("Ton prénom")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Pas encore de compte/ }),
    );
    expect(screen.getByLabelText("Ton prénom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Créer mon compte" }),
    ).toBeInTheDocument();
  });

  it("SSO seul (mot de passe désactivé) : bouton SSO, pas de formulaire", async () => {
    const onOidcLogin = vi.fn();
    render(
      <AuthScreen
        onSubmit={vi.fn()}
        passwordEnabled={false}
        oidcEnabled
        onOidcLogin={onOidcLogin}
      />,
    );
    expect(screen.queryByLabelText("Email")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Se connecter avec le SSO/ }),
    );
    expect(onOidcLogin).toHaveBeenCalledTimes(1);
  });

  it("affiche l'erreur fournie", () => {
    render(<AuthScreen onSubmit={vi.fn()} error="Identifiants invalides" />);
    expect(screen.getByText("Identifiants invalides")).toBeInTheDocument();
  });
});
