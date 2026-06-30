import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const d = (
  code: string,
  category: string,
  over: Partial<ApiDesire> = {},
): ApiDesire => ({
  code,
  category,
  interested: false,
  matched: false,
  done: false,
  ...over,
});

describe("DesiresScreen", () => {
  it("affiche les en-têtes de catégorie (i18n), items repliés par défaut", () => {
    render(
      <DesiresScreen items={[d("oilMassage", "tender"), d("roleplay", "games")]} />,
    );
    expect(
      screen.getByRole("button", { name: /Tendre & complice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Jeux & scénarios/i }),
    ).toBeInTheDocument();
    // Replié : le libellé de l'item n'est pas rendu.
    expect(screen.queryByText("Un massage aux huiles")).toBeNull();
  });

  it("déplie une catégorie au clic et montre ses items", async () => {
    render(<DesiresScreen items={[d("oilMassage", "tender")]} />);
    const header = screen.getByRole("button", { name: /Tendre & complice/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Un massage aux huiles")).toBeInTheDocument();
  });

  it("en-tête de catégorie : badge match quand il y a un match dedans", () => {
    render(
      <DesiresScreen
        items={[d("oilMassage", "tender", { interested: true, matched: true })]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Tendre & complice/i }),
    ).toHaveTextContent("✨ 1");
  });

  it("toggles d'intérêt et de réalisé câblés sur les bons codes", async () => {
    const onToggle = vi.fn();
    const onToggleDone = vi.fn();
    render(
      <DesiresScreen
        items={[d("oilMassage", "tender")]}
        onToggle={onToggle}
        onToggleDone={onToggleDone}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Tendre/i }));
    await userEvent.click(screen.getByRole("button", { name: /tente/i }));
    expect(onToggle).toHaveBeenCalledWith("oilMassage");
    await userEvent.click(screen.getByRole("button", { name: /réalisé/i }));
    expect(onToggleDone).toHaveBeenCalledWith("oilMassage");
  });
});
