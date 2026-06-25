import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChallengeCard } from "./ChallengeCard";

// i18n booté en `fr` par le setup → on assertit sur les libellés FR.
const base = { title: "Massage", description: "desc", intensity: "hot" as const };

describe("ChallengeCard — actions par état × perspective", () => {
  it("proposed / recipient : boutons accepter + négocier", () => {
    render(
      <ChallengeCard
        {...base}
        status="proposed"
        perspective="recipient"
        onAccept={vi.fn()}
        onNegotiate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /challenge accepted/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /maybe, maybe/i }),
    ).toBeInTheDocument();
  });

  it("proposed / proposer : pas de boutons d'action, mais le menu ⋯", () => {
    render(
      <ChallengeCard
        {...base}
        status="proposed"
        perspective="proposer"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /challenge accepted/i }),
    ).toBeNull();
    // ContextMenu : ariaLabel = t("common.actions") = « Actions ».
    expect(screen.getByRole("button", { name: /actions/i })).toBeInTheDocument();
  });

  it("challengeAccepted : bouton « Mission accomplie »", () => {
    render(
      <ChallengeCard
        {...base}
        status="challengeAccepted"
        perspective="recipient"
        onComplete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /mission accomplie/i }),
    ).toBeInTheDocument();
  });

  it("jobDone : aucun bouton d'action", () => {
    render(
      <ChallengeCard {...base} status="jobDone" perspective="recipient" />,
    );
    expect(
      screen.queryByRole("button", { name: /mission accomplie/i }),
    ).toBeNull();
  });
});
