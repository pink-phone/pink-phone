import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const CATEGORY_LABELS: Record<string, string> = {
  tender: "Tendre & complice",
  practices: "Pratiques",
};
const LABELS: Record<string, string> = {
  oilMassage: "Un massage aux huiles",
  bathTogether: "Un bain à deux",
  fellatio: "Fellation",
};
const SOFT_LABELS: Record<string, string> = {
  fellatio: "Une gâterie",
};

const d = (
  code: string,
  category: string,
  over: Partial<ApiDesire> = {},
): ApiDesire => ({
  code,
  category,
  categoryLabelFr: CATEGORY_LABELS[category],
  categoryLabelEn: CATEGORY_LABELS[category],
  subcategory: null,
  labelFr: LABELS[code],
  labelEn: LABELS[code],
  labelFrSoft: SOFT_LABELS[code] ?? null,
  labelEnSoft: SOFT_LABELS[code] ?? null,
  descriptionFr: null,
  descriptionEn: null,
  intensity: "soft",
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

  it("description et repère de sous-catégorie transmis à la carte", async () => {
    render(
      <DesiresScreen
        items={[
          d("oilMassage", "tender", {
            descriptionFr: "Un massage lent, aux huiles chaudes.",
            subcategory: "kamasutra",
          }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Tendre/i }));
    expect(
      screen.getByText("Un massage lent, aux huiles chaudes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Kamasutra")).toBeInTheDocument();
  });
});
