import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenuPicker, GROUPED_PICKER_THRESHOLD } from "./EveningMenuPicker";
import type { ApiEveningMenuItem } from "../../api/types";

const it_ = (
  code: string,
  label: string,
  over: Partial<ApiEveningMenuItem> = {},
): ApiEveningMenuItem => ({
  code,
  category: "evening",
  categoryLabelFr: "Menu du soir",
  categoryLabelEn: "Tonight's menu",
  subcategory: null,
  labelFr: label,
  labelEn: label,
  labelFrSoft: null,
  labelEnSoft: null,
  descriptionFr: null,
  descriptionEn: null,
  intensity: "soft",
  course: "main",
  picked: false,
  matched: false,
  partnerWants: false,
  refused: false,
  ...over,
});

const few = () => [
  it_("a", "Un massage", { picked: true }),
  it_("b", "Un bain à deux"),
  it_("c", "Un slow"),
];

const many = () => {
  const rows = [];
  for (let i = 0; i < GROUPED_PICKER_THRESHOLD + 1; i++) {
    rows.push(it_(`k${i}`, `Position ${i}`, { subcategory: "kamasutra" }));
  }
  rows.push(it_("m1", "La chaise de bureau", { subcategory: "modern" }));
  return rows;
};

describe("EveningMenuPicker", () => {
  it("liste tout le catalogue du service, préselectionne ce qui est déjà coché", () => {
    render(<EveningMenuPicker course="main" items={few()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: /massage/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /bain/i })).not.toBeChecked();
  });

  it("sélection multiple, puis Valider renvoie tous les codes", async () => {
    const onConfirm = vi.fn();
    render(<EveningMenuPicker course="main" items={few()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /bain/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /slow/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect([...onConfirm.mock.calls[0][0]].sort()).toEqual(["a", "b", "c"]);
  });

  it("décocher un item préselectionné le retire de la validation", async () => {
    const onConfirm = vi.fn();
    render(<EveningMenuPicker course="main" items={few()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /massage/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("Annuler ne valide rien", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<EveningMenuPicker course="main" items={few()} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /bain/i }));
    await userEvent.click(screen.getByRole("button", { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("la recherche filtre (sans accents ni casse)", async () => {
    render(<EveningMenuPicker course="main" items={few()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox"), "BAIN");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("Un bain à deux")).toBeInTheDocument();
  });

  it("la sélection survit à une recherche", async () => {
    const onConfirm = vi.fn();
    render(<EveningMenuPicker course="main" items={few()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox"), "bain");
    await userEvent.click(screen.getByRole("checkbox", { name: /bain/i }));
    await userEvent.click(screen.getByRole("button", { name: /effacer/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect([...onConfirm.mock.calls[0][0]].sort()).toEqual(["a", "b"]);
  });

  it("recherche sans résultat : message dédié", async () => {
    render(<EveningMenuPicker course="main" items={few()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/rien ne correspond/i)).toBeInTheDocument();
  });

  it("un item refusé n'est pas proposé", () => {
    render(
      <EveningMenuPicker
        course="main"
        items={[...few(), it_("r", "Refusé·e", { refused: true })]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Refusé·e")).toBeNull();
  });

  it("gros service : groupes repliés, dépliables, recherche aplatit", async () => {
    render(<EveningMenuPicker course="main" items={many()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /kamasutra/i })).toBeInTheDocument();
    expect(screen.queryByText("La chaise de bureau")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /modern/i }));
    expect(screen.getByText("La chaise de bureau")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "bureau");
    expect(screen.queryByRole("button", { name: /kamasutra/i })).toBeNull();
  });
});

describe("EveningMenuPicker — marques et mode ouvert", () => {
  it("proposition de l'autre : ligne « X est partant·e » ; cocher = valider", async () => {
    const onConfirm = vi.fn();
    render(
      <EveningMenuPicker
        course="main"
        items={[it_("p", "Un bain", { partnerWants: true, matched: true })]}
        partnerName="Alex"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/alex est partant/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /bain/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onConfirm).toHaveBeenCalledWith(["p"]);
  });

  it("décocher un match le signale (« Défait le match »)", async () => {
    render(
      <EveningMenuPicker
        course="main"
        items={[it_("m", "Un massage", { picked: true, matched: true })]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText(/défait le match/i)).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /massage/i }));
    expect(screen.getByText(/défait le match/i)).toBeInTheDocument();
  });
});

describe("EveningMenuPicker — étendue (service / tout le catalogue)", () => {
  const mixed = () => [
    it_("a", "Un massage", { course: "main" }),
    it_("b", "Un dîner", { course: "starter" }),
    it_("c", "Un lieu insolite", { course: "", category: "places" }),
  ];

  it("par défaut : seulement les items du service", () => {
    render(<EveningMenuPicker course="main" items={mixed()} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /massage/i })).toBeInTheDocument();
  });

  it("« Tout le catalogue » permet de choisir hors des catégories du service", async () => {
    const onConfirm = vi.fn();
    render(<EveningMenuPicker course="main" items={mixed()} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: /tout le catalogue/i }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await userEvent.click(screen.getByRole("checkbox", { name: /lieu insolite/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onConfirm).toHaveBeenCalledWith(["c"]);
  });

  it("la sélection d'un autre service est conservée à la validation", async () => {
    const onConfirm = vi.fn();
    const items = [
      it_("a", "Un massage", { course: "main" }),
      it_("b", "Un dîner", { course: "starter", picked: true }),
    ];
    render(<EveningMenuPicker course="main" items={items} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /massage/i }));
    await userEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect([...onConfirm.mock.calls[0][0]].sort()).toEqual(["a", "b"]);
  });

  it("service vide : s'ouvre directement sur tout le catalogue", () => {
    render(
      <EveningMenuPicker
        course="dessert"
        items={[it_("a", "Un massage", { course: "main" })]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /tout le catalogue/i })).toBeChecked();
  });
});

describe("EveningMenuPicker — catégorie nourrissant plusieurs services", () => {
  it("un item dont la catégorie alimente 2 services est proposé dans chacun", () => {
    const item = it_("x", "Un massage", { course: "main", courses: ["main", "dessert"] });
    const open = (course: "starter" | "main" | "dessert") =>
      render(
        <EveningMenuPicker course={course} items={[item]} onConfirm={vi.fn()} onCancel={vi.fn()} />,
      );
    let view = open("main");
    expect(screen.getByRole("checkbox", { name: /massage/i })).toBeInTheDocument();
    view.unmount();
    view = open("dessert");
    expect(screen.getByRole("checkbox", { name: /massage/i })).toBeInTheDocument();
    view.unmount();
    open("starter");
    // Entrée : aucun item → ouvre sur « Tout le catalogue », donc l'item reste atteignable.
    expect(screen.getByRole("radio", { name: /tout le catalogue/i })).toBeChecked();
  });
});
