import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenuEntry, entryState } from "./EveningMenuEntry";

const base = { label: "Un massage", picked: false, matched: false };

describe("entryState", () => {
  it("priorité : refusé > proposé > match > mine > vide", () => {
    expect(entryState({ picked: true, matched: true, refused: true })).toBe("refused");
    // proposition de l'autre (révélée, matched) que je n'ai pas validée
    expect(entryState({ picked: false, matched: true, partnerWants: true })).toBe("proposed");
    expect(entryState({ picked: true, matched: true, partnerWants: true })).toBe("match");
    expect(entryState({ picked: true, matched: false })).toBe("mine");
    expect(entryState({ picked: false, matched: false })).toBe("empty");
  });
});

describe("EveningMenuEntry", () => {
  it("affiche libellé, description et sous-catégorie", () => {
    render(
      <EveningMenuEntry {...base} label="Le lotus" description="Front contre front." subcategoryLabel="Kamasutra" />,
    );
    expect(screen.getByText("Le lotus")).toBeInTheDocument();
    expect(screen.getByText("Front contre front.")).toBeInTheDocument();
    expect(screen.getByText("Kamasutra")).toBeInTheDocument();
  });

  it("le corps n'est pas cliquable : aucun bouton sur un item non choisi", () => {
    render(<EveningMenuEntry {...base} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("mon choix : bouton ✕ nommé qui appelle onRemove", async () => {
    const onRemove = vi.fn();
    render(<EveningMenuEntry {...base} picked onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: /retirer « un massage »/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("mode ouvert : « En attente de X » sur mon choix ; absent en mode aveugle", () => {
    const { rerender } = render(<EveningMenuEntry {...base} picked openMode partnerName="Alex" />);
    expect(screen.getByText(/en attente de alex/i)).toBeInTheDocument();
    rerender(<EveningMenuEntry {...base} picked partnerName="Alex" />);
    expect(screen.queryByText(/en attente/i)).toBeNull();
  });

  it("match : statut « Match », pas d'attente", () => {
    render(<EveningMenuEntry {...base} picked matched openMode />);
    expect(screen.getByText(/match/i)).toBeInTheDocument();
    expect(screen.queryByText(/en attente/i)).toBeNull();
  });

  it("match validé ensemble : statut distinct d'un match par coïncidence", () => {
    const { rerender } = render(<EveningMenuEntry {...base} picked matched />);
    expect(screen.getByText(/^match/i)).toBeInTheDocument();
    rerender(<EveningMenuEntry {...base} picked matched agreed />);
    expect(screen.getByText(/validé ensemble/i)).toBeInTheDocument();
  });

  it("proposition : « X est partant·e » + Partant·e / Pas ce soir", async () => {
    const onAccept = vi.fn();
    const onRefuse = vi.fn();
    render(
      <EveningMenuEntry
        {...base}
        partnerWants
        matched
        partnerName="Alex"
        onAccept={onAccept}
        onRefuse={onRefuse}
      />,
    );
    expect(screen.getByText(/alex est partant/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /partant·e pour/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /pas ce soir pour/i }));
    expect(onRefuse).toHaveBeenCalledTimes(1);
  });

  it("proposition : pas de ✕ (le seul geste est répondre)", () => {
    render(<EveningMenuEntry {...base} partnerWants onAccept={vi.fn()} onRefuse={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /retirer/i })).toBeNull();
  });

  it("refusé : badge, libellé barré, aucun bouton", () => {
    render(<EveningMenuEntry {...base} picked refused onRemove={vi.fn()} onRefuse={vi.fn()} />);
    expect(screen.getByText("Refusé")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
