import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardScreen, type DashboardPartner } from "./DashboardScreen";

const partner = (id: string, name: string): DashboardPartner => ({
  id,
  name,
  glyph: name.charAt(0),
  mood: "calm",
});

const base = {
  spaceName: "Notre salon",
  myMood: "veryHot",
  onMoodChange: vi.fn(),
};

describe("DashboardScreen — wording couple vs groupe (#52)", () => {
  it("couple (1 autre) : formulation au singulier avec le prénom", () => {
    render(<DashboardScreen {...base} partners={[partner("p1", "Camille")]} />);
    expect(
      screen.getByText(/partagée avec Camille/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/partagée avec le salon/i)).toBeNull();
  });

  it("groupe (≥ 2 autres) : formulation au pluriel « le salon »", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille"), partner("p2", "Alex")]}
      />,
    );
    expect(screen.getByText(/partagée avec le salon/i)).toBeInTheDocument();
    expect(screen.queryByText(/partagée avec Camille/i)).toBeNull();
  });

  it("une carte météo par membre (moi + chaque autre)", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille"), partner("p2", "Alex")]}
      />,
    );
    // Moi + 2 membres = 3 noms affichés.
    expect(screen.getByText("Toi")).toBeInTheDocument();
    expect(screen.getByText("Camille")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it("seul (0 autre) : bloc d'invitation, pas de formulation « partagée »", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[]}
        inviteToken={null}
        onCreateInvite={vi.fn()}
      />,
    );
    expect(screen.queryByText(/partagée avec/i)).toBeNull();
    expect(screen.getByText(/enregistrée/i)).toBeInTheDocument();
  });
});
