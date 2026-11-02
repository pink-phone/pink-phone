import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenuScreen } from "./EveningMenuScreen";
import type { ApiEveningMenuItem } from "../../api/types";

const LABELS: Record<string, string> = {
  "evening-massage": "Un massage",
  "evening-cuddle": "Câlins sous la couette",
  "kamasutra-lotus": "Le lotus",
  "evening-passionate": "Une nuit passionnée",
};

const d = (
  code: string,
  course: ApiEveningMenuItem["course"],
  over: Partial<ApiEveningMenuItem> = {},
): ApiEveningMenuItem => ({
  code,
  category: "evening",
  categoryLabelFr: "Menu du soir",
  categoryLabelEn: "Tonight's menu",
  subcategory: null,
  labelFr: LABELS[code],
  labelEn: LABELS[code],
  labelFrSoft: null,
  labelEnSoft: null,
  descriptionFr: null,
  descriptionEn: null,
  intensity: "soft",
  course,
  picked: false,
  matched: false,
  partnerWants: false,
  refused: false,
  ...over,
});

describe("EveningMenuScreen", () => {
  it("affiche la sélection du service actif par défaut (Entrée)", () => {
    render(
      <EveningMenuScreen
        items={[
          d("evening-massage", "starter", { picked: true }),
          d("kamasutra-lotus", "main", { picked: true }),
        ]}
      />,
    );
    expect(screen.getByText("Un massage")).toBeInTheDocument();
    expect(screen.queryByText("Le lotus")).toBeNull();
  });

  it("changer d'onglet affiche la sélection de l'autre service", async () => {
    render(
      <EveningMenuScreen
        items={[
          d("evening-massage", "starter", { picked: true }),
          d("kamasutra-lotus", "main", { picked: true }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /plat/i }));
    expect(screen.getByText("Le lotus")).toBeInTheDocument();
    expect(screen.queryByText("Un massage")).toBeNull();
  });

  it("les 3 services restent cliquables même sans pick (pas de verrouillage)", async () => {
    render(
      <EveningMenuScreen
        items={[
          d("evening-massage", "starter"),
          d("kamasutra-lotus", "main"),
          d("evening-passionate", "dessert"),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /dessert/i }));
    expect(screen.getByRole("tab", { name: /dessert/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("bouton retour appelle onBack", async () => {
    const onBack = vi.fn();
    render(
      <EveningMenuScreen
        items={[d("evening-massage", "starter")]}
        onBack={onBack}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retour/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("✕ retire l'item sans repasser par la sélection, avec toast « Annuler »", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[d("evening-massage", "starter", { picked: true })]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retirer/i }));
    expect(onToggle).toHaveBeenCalledWith("evening-massage");
    expect(screen.getByRole("status")).toHaveTextContent(/retiré/i);
    await userEvent.click(screen.getByRole("button", { name: /annuler/i }));
    // Annuler = second toggle (remet l'item).
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retirer un match demande confirmation ; refus = rien ne change", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[d("evening-massage", "starter", { picked: true, matched: true })]}
        partnerName="Alex"
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retirer/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/match avec alex/i));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /retirer/i }));
    expect(onToggle).toHaveBeenCalledWith("evening-massage");
    confirm.mockRestore();
  });

  it("mode ouvert : « Partant·e » valide une proposition (onToggle)", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[d("evening-massage", "starter", { partnerWants: true, matched: true })]}
        partnerName="Alex"
        onToggle={onToggle}
        onRefuse={vi.fn()}
      />,
    );
    expect(screen.getByText(/alex est partant/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /partant·e pour/i }));
    expect(onToggle).toHaveBeenCalledWith("evening-massage");
  });

  it("mode ouvert : clic refuser appelle onRefuse avec le code", async () => {
    const onRefuse = vi.fn();
    render(
      <EveningMenuScreen
        items={[
          d("evening-massage", "starter", { partnerWants: true, matched: true }),
        ]}
        onRefuse={onRefuse}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /pas ce soir/i }));
    expect(onRefuse).toHaveBeenCalledWith("evening-massage");
  });

  it("Ajouter ouvre l'écran de sélection ; valider applique le diff et revient au panneau", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[
          d("evening-massage", "starter", { picked: true }),
          d("evening-cuddle", "starter"),
        ]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ajouter/i }));
    // Écran de sélection : tout le catalogue du service, massage déjà coché.
    expect(screen.getByRole("checkbox", { name: /massage/i })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /câlins/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("evening-cuddle", "starter");
    // Retour au panneau.
    expect(screen.getByRole("tab", { name: /entrée/i })).toBeInTheDocument();
  });

  it("piocher hors catégorie : l'item d'un autre service est ajouté au service courant", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[
          d("evening-cuddle", "starter"),
          d("kamasutra-lotus", "main"),
          d("evening-passionate", ""),
        ]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ajouter/i }));
    // Par défaut : seulement les items du service Entrée.
    expect(screen.queryByRole("checkbox", { name: /lotus/i })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /tout le catalogue/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /lotus/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /passionnée/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onToggle).toHaveBeenCalledWith("kamasutra-lotus", "starter");
    expect(onToggle).toHaveBeenCalledWith("evening-passionate", "starter");
  });

  it("un item ajouté dans un service s'affiche dans ce service", () => {
    render(
      <EveningMenuScreen
        items={[d("kamasutra-lotus", "starter", { picked: true })]}
      />,
    );
    expect(screen.getByText("Le lotus")).toBeInTheDocument();
  });

  it("annuler la sélection ne change rien", async () => {
    const onToggle = vi.fn();
    render(
      <EveningMenuScreen
        items={[d("evening-cuddle", "starter")]}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ajouter/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /câlins/i }));
    await userEvent.click(screen.getByRole("button", { name: /annuler/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /entrée/i })).toBeInTheDocument();
  });

  describe("mode aveugle : « J'ai fini »", () => {
    const status = (over = {}) => ({
      meDone: false,
      doneCount: 0,
      memberCount: 2,
      revealed: false,
      ...over,
    });

    it("bouton « J'ai fini » → onDone ; pas d'« en attente » sur mes choix", async () => {
      const onDone = vi.fn();
      render(
        <EveningMenuScreen
          blind
          status={status()}
          onDone={onDone}
          items={[d("evening-massage", "starter", { picked: true })]}
        />,
      );
      expect(screen.queryByText(/en attente/i)).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: /j'ai fini/i }));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("validé : lecture seule (ni Ajouter ni ✕), « Modifier » rouvre", async () => {
      const onUndoDone = vi.fn();
      render(
        <EveningMenuScreen
          blind
          status={status({ meDone: true, doneCount: 1 })}
          onDone={vi.fn()}
          onUndoDone={onUndoDone}
          items={[d("evening-massage", "starter", { picked: true })]}
        />,
      );
      expect(screen.queryByRole("button", { name: /ajouter/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /retirer/i })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: /modifier/i }));
      expect(onUndoDone).toHaveBeenCalledTimes(1);
    });

    it("dévoilé : les idées de l'autre apparaissent et se valident ou se refusent", async () => {
      const onToggle = vi.fn();
      const onRefuse = vi.fn();
      render(
        <EveningMenuScreen
          blind
          partnerName="Alex"
          status={status({ meDone: true, doneCount: 2, revealed: true })}
          onDone={vi.fn()}
          onToggle={onToggle}
          onRefuse={onRefuse}
          items={[
            d("evening-cuddle", "starter", { partnerWants: true }),
            d("evening-massage", "starter", { picked: true }),
          ]}
        />,
      );
      expect(screen.getByText(/alex est partant/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /partant·e pour « câlins/i }));
      expect(onToggle).toHaveBeenCalledWith("evening-cuddle");
      await userEvent.click(screen.getByRole("button", { name: /pas ce soir pour « câlins/i }));
      expect(onRefuse).toHaveBeenCalledWith("evening-cuddle");
      // Mon menu d'origine reste figé : ni Ajouter, ni ✕ sur mon choix d'avant.
      expect(screen.queryByRole("button", { name: /ajouter/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /retirer « un massage/i })).toBeNull();
    });

    it("dévoilé : ma réponse tardive (« validé ensemble ») se retire", async () => {
      const onToggle = vi.fn();
      render(
        <EveningMenuScreen
          blind
          status={status({ meDone: true, doneCount: 2, revealed: true })}
          onDone={vi.fn()}
          onToggle={onToggle}
          items={[
            d("evening-cuddle", "starter", {
              picked: true,
              matched: true,
              partnerWants: true,
              agreed: true,
              responded: true,
            }),
          ]}
        />,
      );
      expect(screen.getByText(/validé ensemble/i)).toBeInTheDocument();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await userEvent.click(screen.getByRole("button", { name: /retirer « câlins/i }));
      expect(onToggle).toHaveBeenCalledWith("evening-cuddle");
    });

    it("mode ouvert : pas de « J'ai fini »", () => {
      render(
        <EveningMenuScreen
          blind={false}
          status={status()}
          onDone={vi.fn()}
          items={[d("evening-massage", "starter", { picked: true })]}
        />,
      );
      expect(screen.queryByRole("button", { name: /j'ai fini/i })).toBeNull();
    });
  });
});
