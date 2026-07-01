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
  against: false,
  matched: false,
  limit: false,
  done: false,
  ...over,
});

describe("DesiresScreen", () => {
  it("en-têtes de catégorie (dont Pratiques), items repliés par défaut", () => {
    render(
      <DesiresScreen items={[d("oilMassage", "tender"), d("fellatio", "practices")]} />,
    );
    expect(
      screen.getByRole("button", { name: /Tendre & complice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pratiques/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Un massage aux huiles")).toBeNull();
  });

  it("registre explicite vs suggestif change le libellé d'un item cru", async () => {
    const { rerender } = render(
      <DesiresScreen items={[d("fellatio", "practices")]} explicit />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Pratiques/i }));
    expect(screen.getByText("Fellation")).toBeInTheDocument();
    // rerender garde la catégorie dépliée : le libellé bascule en suggestif.
    rerender(<DesiresScreen items={[d("fellatio", "practices")]} explicit={false} />);
    expect(screen.getByText("Une gâterie")).toBeInTheDocument();
    expect(screen.queryByText("Fellation")).toBeNull();
  });

  it("en-tête : badge match + badge limite", () => {
    render(
      <DesiresScreen
        items={[
          d("oilMassage", "tender", { interested: true, matched: true }),
          d("bathTogether", "tender", { limit: true }),
        ]}
      />,
    );
    const header = screen.getByRole("button", { name: /Tendre & complice/i });
    expect(header).toHaveTextContent("✨ 1");
    expect(header).toHaveTextContent("❌ 1");
  });

  it("envie / contre / réalisé câblés sur les bons codes", async () => {
    const onToggleWant = vi.fn();
    const onToggleAgainst = vi.fn();
    const onToggleDone = vi.fn();
    render(
      <DesiresScreen
        items={[d("oilMassage", "tender")]}
        onToggleWant={onToggleWant}
        onToggleAgainst={onToggleAgainst}
        onToggleDone={onToggleDone}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Tendre/i }));
    await userEvent.click(screen.getByRole("button", { name: /tente/i }));
    expect(onToggleWant).toHaveBeenCalledWith("oilMassage");
    await userEvent.click(screen.getByRole("button", { name: /contre|limite/i }));
    expect(onToggleAgainst).toHaveBeenCalledWith("oilMassage");
    await userEvent.click(screen.getByRole("button", { name: /réalisé/i }));
    expect(onToggleDone).toHaveBeenCalledWith("oilMassage");
  });
});
