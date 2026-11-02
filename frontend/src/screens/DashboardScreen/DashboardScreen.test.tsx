import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
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
  userId: "me",
};

describe("DashboardScreen", () => {
  it("une carte météo par membre (moi + chaque autre)", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille"), partner("p2", "Alex")]}
      />,
    );
    expect(screen.getByText("Toi")).toBeInTheDocument();
    expect(screen.getByText("Camille")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it("ma carte est cliquable → onOpenMood (saisie d'humeur en feuille)", async () => {
    const onOpenMood = vi.fn();
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        onOpenMood={onOpenMood}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /changer mon humeur/i }),
    );
    expect(onOpenMood).toHaveBeenCalledTimes(1);
  });

  it("entrée « Menu du soir » → onOpenEveningMenu, avec badge match", async () => {
    const onOpenEveningMenu = vi.fn();
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        eveningMenuMatches={1}
        onOpenEveningMenu={onOpenEveningMenu}
      />,
    );
    const entry = screen.getByRole("button", { name: /Menu du soir/i });
    expect(entry).toHaveTextContent(/1 match/i);
    await userEvent.click(entry);
    expect(onOpenEveningMenu).toHaveBeenCalledTimes(1);
  });

  it("114a : la tuile « Menu du soir » montre le menu sans l'ouvrir (service + items, +N)", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        eveningMenuPreview={[
          { course: "starter", labels: ["Câlins"], matched: false },
          { course: "main", labels: ["A", "B", "C", "D"], matched: true },
        ]}
        onOpenEveningMenu={vi.fn()}
      />,
    );
    const entry = screen.getByRole("button", { name: /Menu du soir/i });
    expect(entry).toHaveTextContent(/Entrée/);
    expect(entry).toHaveTextContent("Câlins");
    expect(entry).toHaveTextContent("A, B, C, D");
    // l'indice générique n'est affiché que quand le menu est vide
    expect(entry).not.toHaveTextContent(/en secret/i);
  });

  it("un seul service rempli : les 3 lignes restent, les vides affichent « — »", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        eveningMenuPreview={[
          { course: "starter", labels: ["Câlins"], matched: false },
          { course: "main", labels: [], matched: false },
          { course: "dessert", labels: [], matched: false },
        ]}
        onOpenEveningMenu={vi.fn()}
      />,
    );
    const entry = screen.getByRole("button", { name: /Menu du soir/i });
    expect(entry).toHaveTextContent(/Entrée/);
    expect(entry).toHaveTextContent(/Plat/);
    expect(entry).toHaveTextContent(/Dessert/);
    expect(screen.getAllByLabelText(/rien de choisi/i)).toHaveLength(2);
  });

  it("beaucoup d'items : plafonné avec « +N », sans troncature", () => {
    const labels = ["a", "b", "c", "d", "e", "f", "g"];
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        eveningMenuPreview={[{ course: "main", labels, matched: false }]}
        onOpenEveningMenu={vi.fn()}
      />,
    );
    const entry = screen.getByRole("button", { name: /Menu du soir/i });
    expect(entry).toHaveTextContent("a, b, c, d, e +2");
    expect(entry).not.toHaveTextContent(/f, g/);
  });

  it("menu entièrement vide (3 lignes vides) → indice générique", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        eveningMenuPreview={[
          { course: "starter", labels: [], matched: false },
          { course: "main", labels: [], matched: false },
          { course: "dessert", labels: [], matched: false },
        ]}
        onOpenEveningMenu={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Menu du soir/i })).toHaveTextContent(/en secret/i);
  });

  it("114a : menu vide → indice générique conservé", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        eveningMenuEnabled
        onOpenEveningMenu={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Menu du soir/i })).toHaveTextContent(/en secret/i);
  });

  it("bouton « écrire un mot doux » → onComposeLoveNote", async () => {
    const onComposeLoveNote = vi.fn();
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        onComposeLoveNote={onComposeLoveNote}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /mot/i }));
    expect(onComposeLoveNote).toHaveBeenCalledTimes(1);
  });

  it("notices (#84/#85) : affiche les messages connus, ignore les kinds inconnus", () => {
    render(
      <DashboardScreen
        {...base}
        partners={[partner("p1", "Camille")]}
        notices={[
          { id: "1", kind: "member_joined", actorName: "Camille" },
          { id: "2", kind: "download_enabled", actorName: "Alex" },
          { id: "3", kind: "unknown_kind", actorName: "X" },
        ]}
      />,
    );
    expect(screen.getByText(/Camille a rejoint le salon/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Alex a activé le téléchargement/i),
    ).toBeInTheDocument();
  });
});
