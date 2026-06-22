import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChallengesScreen } from "./ChallengesScreen";
import type { ChallengeData } from "../../types/view";

const challenge = (
  id: string,
  status: ChallengeData["status"],
): ChallengeData => ({
  id,
  title: `Défi ${id}`,
  description: "Une description",
  intensity: "hot",
  status,
  perspective: "recipient",
});

describe("ChallengesScreen", () => {
  it("liste vide : affiche le message d'invitation", () => {
    render(<ChallengesScreen challenges={[]} />);
    expect(
      screen.getByText(/aucun défi pour l'instant/i),
    ).toBeInTheDocument();
  });

  it("hasMore absent : pas de bouton « Voir plus »", () => {
    render(
      <ChallengesScreen challenges={[challenge("c1", "proposed")]} hasMore={false} />,
    );
    expect(
      screen.queryByRole("button", { name: /voir plus/i }),
    ).toBeNull();
  });

  it("hasMore=true : bouton « Voir plus » visible", () => {
    render(
      <ChallengesScreen challenges={[challenge("c1", "proposed")]} hasMore />,
    );
    expect(
      screen.getByRole("button", { name: /voir plus/i }),
    ).toBeInTheDocument();
  });

  it("loadingMore=true : bouton affiche « Chargement… » et est désactivé", () => {
    render(
      <ChallengesScreen
        challenges={[challenge("c1", "proposed")]}
        hasMore
        loadingMore
      />,
    );
    const btn = screen.getByRole("button", { name: /chargement/i });
    expect(btn).toBeDisabled();
  });

  it("cliquer sur « Voir plus » appelle onLoadMore", async () => {
    const onLoadMore = vi.fn();
    render(
      <ChallengesScreen
        challenges={[challenge("c1", "proposed")]}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /voir plus/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("un défi 'proposed' apparaît sous la section « Propositions »", () => {
    render(
      <ChallengesScreen challenges={[challenge("c1", "proposed")]} />,
    );
    expect(screen.getByText(/propositions/i)).toBeInTheDocument();
    expect(screen.getByText("Défi c1")).toBeInTheDocument();
  });

  it("un défi 'challengeAccepted' apparaît sous la section « En cours »", () => {
    render(
      <ChallengesScreen
        challenges={[challenge("c1", "challengeAccepted")]}
      />,
    );
    // L'en-tête de section est un <h2> — distinct du badge "En cours" dans la carte.
    expect(screen.getByRole("heading", { name: /en cours/i })).toBeInTheDocument();
    expect(screen.getByText("Défi c1")).toBeInTheDocument();
  });

  it("les défis sont groupés par section correctement", () => {
    render(
      <ChallengesScreen
        challenges={[
          challenge("c1", "proposed"),
          challenge("c2", "jobDone"),
        ]}
      />,
    );
    expect(screen.getByText(/propositions/i)).toBeInTheDocument();
    expect(screen.getByText(/accomplis/i)).toBeInTheDocument();
    expect(screen.queryByText(/en cours/i)).toBeNull();
  });
});
