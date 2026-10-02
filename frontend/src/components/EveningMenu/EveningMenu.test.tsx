import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenu } from "./EveningMenu";
import type { ApiEveningMenuItem } from "../../api/types";

const LABELS: Record<string, string> = {
  "evening-massage": "Un massage",
  "evening-movie": "Un film, blotti·e·s",
};

const it_ = (
  code: string,
  over: Partial<ApiEveningMenuItem> = {},
): ApiEveningMenuItem => ({
  code,
  category: "evening",
  categoryLabelFr: "Menu du soir",
  categoryLabelEn: "Tonight's menu",
  subcategory: null,
  labelFr: LABELS[code] ?? code,
  labelEn: LABELS[code] ?? code,
  labelFrSoft: null,
  labelEnSoft: null,
  descriptionFr: null,
  descriptionEn: null,
  intensity: "soft",
  course: "starter",
  picked: false,
  matched: false,
  partnerWants: false,
  refused: false,
  ...over,
});

describe("EveningMenu — panneau de sélection", () => {
  it("n'affiche que les items sur le menu, pas tout le catalogue", () => {
    render(
      <EveningMenu
        items={[it_("evening-massage", { picked: true }), it_("evening-movie")]}
      />,
    );
    expect(screen.getByText("Un massage")).toBeInTheDocument();
    expect(screen.queryByText(/film/i)).toBeNull();
  });

  it("état vide quand rien n'est sélectionné", () => {
    render(<EveningMenu items={[it_("evening-massage")]} />);
    expect(screen.getByText(/rien de choisi/i)).toBeInTheDocument();
  });

  it("pas de bouton Ajouter sans onAdd", () => {
    render(<EveningMenu items={[it_("evening-massage")]} />);
    expect(screen.queryByRole("button", { name: /ajouter/i })).toBeNull();
  });

  it("clic sur Ajouter appelle onAdd", async () => {
    const onAdd = vi.fn();
    render(<EveningMenu items={[it_("evening-massage")]} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /ajouter/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("mon choix : bouton « Retirer » nommé", () => {
    render(<EveningMenu items={[it_("evening-massage", { picked: true })]} />);
    expect(
      screen.getByRole("button", { name: /retirer « un massage »/i }),
    ).toBeInTheDocument();
  });

  it("affiche le compteur de matchs quand il y en a", () => {
    render(
      <EveningMenu
        items={[it_("evening-massage", { picked: true, matched: true })]}
      />,
    );
    expect(screen.getByText(/\d+ match/i)).toBeInTheDocument();
  });

  it("pas de compteur sans match", () => {
    render(<EveningMenu items={[it_("evening-massage", { picked: true })]} />);
    expect(screen.queryByText(/\d+ match/i)).toBeNull();
  });

  it("✕ appelle onRemove avec l'item et son libellé", async () => {
    const onRemove = vi.fn();
    render(
      <EveningMenu
        items={[it_("evening-massage", { picked: true })]}
        onRemove={onRemove}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retirer/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove.mock.calls[0][0].code).toBe("evening-massage");
    expect(onRemove.mock.calls[0][1]).toBe("Un massage");
  });

  it("sans onRemove, ✕ retombe sur onToggle", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenu
        items={[it_("evening-massage", { picked: true })]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retirer/i }));
    expect(onToggle).toHaveBeenCalledWith("evening-massage");
  });

  it("« Partant·e » sur une proposition appelle onToggle (pose mon choix)", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenu
        items={[it_("evening-massage", { partnerWants: true })]}
        onToggle={onToggle}
        onRefuse={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /partant·e pour/i }));
    expect(onToggle).toHaveBeenCalledWith("evening-massage");
  });

  it("registre suggestif bascule le libellé quand une variante existe", () => {
    render(
      <EveningMenu
        explicit={false}
        items={[
          it_("evening-massage", {
            picked: true,
            labelFr: "Sodomie",
            labelFrSoft: "L'amour par-derrière",
          }),
        ]}
      />,
    );
    expect(screen.getByText("L'amour par-derrière")).toBeInTheDocument();
    expect(screen.queryByText("Sodomie")).toBeNull();
  });

  it("mode ouvert : une proposition du/de la partenaire apparaît avec le bouton refuser", async () => {
    const onRefuse = vi.fn();
    render(
      <EveningMenu
        items={[it_("evening-massage", { partnerWants: true })]}
        onRefuse={onRefuse}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /pas ce soir/i }));
    expect(onRefuse).toHaveBeenCalledWith("evening-massage");
  });

  it("mode aveugle (partnerWants faux) : pas de bouton refuser", () => {
    render(
      <EveningMenu
        items={[it_("evening-massage", { picked: true })]}
        onRefuse={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /pas ce soir/i })).toBeNull();
  });

  it("item refusé : visible mais plus de bouton refuser", () => {
    render(
      <EveningMenu items={[it_("evening-massage", { refused: true })]} onRefuse={vi.fn()} />,
    );
    expect(screen.getByText("Un massage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pas ce soir/i })).toBeNull();
  });
});
