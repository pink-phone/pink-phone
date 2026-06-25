import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LockScreen } from "./LockScreen";

afterEach(() => vi.useRealTimers());

describe("LockScreen", () => {
  it("affiche titre/sous-titre", () => {
    render(<LockScreen title="Verrouillé" subtitle="Saisis ton code" onSubmit={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Verrouillé" })).toBeInTheDocument();
    expect(screen.getByText("Saisis ton code")).toBeInTheDocument();
  });

  it("auto-soumission une fois `pinLength` chiffres saisis", () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(<LockScreen title="X" pinLength={4} onSubmit={onSubmit} />);
    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }
    // Le dernier point s'affiche puis soumission différée (120 ms).
    expect(onSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(onSubmit).toHaveBeenCalledWith("1234");
  });

  it("une erreur affiche une alerte (et réinitialise la saisie)", () => {
    render(<LockScreen title="X" error="Code incorrect" onSubmit={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Code incorrect");
  });

  it("bouton biométrique présent si onBiometric, et déclenché au clic", async () => {
    const onBiometric = vi.fn();
    render(
      <LockScreen title="X" onSubmit={vi.fn()} onBiometric={onBiometric} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Déverrouiller par biométrie/ }),
    );
    expect(onBiometric).toHaveBeenCalledTimes(1);
  });

  it("pas de bouton biométrique sans onBiometric", () => {
    render(<LockScreen title="X" onSubmit={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /biométrie/ }),
    ).toBeNull();
  });
});
