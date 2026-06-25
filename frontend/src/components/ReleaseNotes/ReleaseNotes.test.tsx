import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReleaseNotes } from "./ReleaseNotes";
import type { ReleaseNote } from "../../releaseNotes";

const notes: ReleaseNote[] = [
  {
    version: "Deux",
    date: "2026-06-25",
    items: { fr: ["Nouveauté récente"], en: ["Recent thing"] },
  },
  {
    version: "Un",
    date: "2026-06-01",
    items: { fr: ["Ancienne nouveauté"], en: ["Older thing"] },
  },
];

describe("ReleaseNotes", () => {
  it("rend chaque version avec ses points (langue par défaut = fr via setup i18n)", () => {
    render(<ReleaseNotes notes={notes} />);
    expect(screen.getByText("Deux")).toBeInTheDocument();
    expect(screen.getByText("Un")).toBeInTheDocument();
    expect(screen.getByText("Nouveauté récente")).toBeInTheDocument();
    expect(screen.getByText("Ancienne nouveauté")).toBeInTheDocument();
    // Pas le contenu anglais.
    expect(screen.queryByText("Recent thing")).toBeNull();
  });

  it("badge « récent » uniquement sur la première (plus récente) version", () => {
    render(<ReleaseNotes notes={notes} />);
    const badges = screen.getAllByText("Récent");
    expect(badges).toHaveLength(1);
  });

  it("liste vide → message de repli", () => {
    render(<ReleaseNotes notes={[]} />);
    expect(
      screen.getByText("Aucune note de version pour le moment."),
    ).toBeInTheDocument();
  });
});
