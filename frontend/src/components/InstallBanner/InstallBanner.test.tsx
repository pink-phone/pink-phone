import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallBanner } from "./InstallBanner";

describe("InstallBanner", () => {
  it("android : bouton « Installer » qui déclenche onInstall + instruction android", async () => {
    const onInstall = vi.fn();
    render(<InstallBanner mode="android" onInstall={onInstall} />);
    const btn = screen.getByRole("button", { name: "Installer" });
    await userEvent.click(btn);
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Sur l'écran d'accueil, comme une vraie appli."),
    ).toBeInTheDocument();
  });

  it("ios : pas de bouton d'installation (instructions manuelles)", () => {
    render(<InstallBanner mode="ios" />);
    expect(screen.queryByRole("button", { name: "Installer" })).toBeNull();
    expect(
      screen.getByText("Touchez ⎋ Partager, puis « Sur l'écran d'accueil »."),
    ).toBeInTheDocument();
  });

  it("la croix « Fermer » déclenche onDismiss", async () => {
    const onDismiss = vi.fn();
    render(<InstallBanner mode="ios" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
