import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  EveningCourseSettings,
  defaultEntries,
  isSelected,
  toggleEntry,
  type CourseCategory,
} from "./EveningCourseSettings";

const CATS: CourseCategory[] = [
  { id: "tender", label: "Tendre", defaultCourses: ["starter"] },
  { id: "games", label: "Jeux", defaultCourses: ["starter", "main"] },
  { id: "places", label: "Lieux", defaultCourses: [] },
];

describe("helpers", () => {
  it("defaultEntries : classement du catalogue en entrées service:categorie", () => {
    expect(defaultEntries(CATS)).toEqual(["starter:tender", "starter:games", "main:games"]);
  });

  it("isSelected : défaut tant que non personnalisé, entrées sinon", () => {
    expect(isSelected(CATS, false, [], "main", "games")).toBe(true);
    expect(isSelected(CATS, false, [], "main", "tender")).toBe(false);
    expect(isSelected(CATS, true, ["main:tender"], "main", "tender")).toBe(true);
    expect(isSelected(CATS, true, ["main:tender"], "starter", "tender")).toBe(false);
  });

  it("toggleEntry : matérialise le défaut au premier changement", () => {
    expect(toggleEntry(CATS, false, [], "main", "tender")).toEqual([
      "starter:tender",
      "starter:games",
      "main:games",
      "main:tender",
    ]);
  });

  it("toggleEntry : décoche, sans toucher aux autres services (multi)", () => {
    expect(toggleEntry(CATS, true, ["starter:games", "main:games"], "main", "games")).toEqual([
      "starter:games",
    ]);
  });
});

describe("EveningCourseSettings", () => {
  const renderIt = (props: Partial<React.ComponentProps<typeof EveningCourseSettings>> = {}) =>
    render(
      <EveningCourseSettings
        categories={CATS}
        custom={false}
        entries={[]}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...props}
      />,
    );

  it("une section repliée par service, avec le résumé des catégories", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /entrée/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /entrée/i })).toHaveTextContent("Tendre, Jeux");
    expect(screen.getByRole("button", { name: /dessert/i })).toHaveTextContent(/aucune catégorie/i);
  });

  it("déplier montre les catégories ; cocher une catégorie appelle onChange (matérialisé)", async () => {
    const onChange = vi.fn();
    renderIt({ onChange });
    await userEvent.click(screen.getByRole("button", { name: /dessert/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /lieux/i }));
    expect(onChange).toHaveBeenCalledWith([
      "starter:tender",
      "starter:games",
      "main:games",
      "dessert:places",
    ]);
  });

  it("une même catégorie peut être cochée dans plusieurs services", async () => {
    const onChange = vi.fn();
    renderIt({ custom: true, entries: ["starter:tender"], onChange });
    await userEvent.click(screen.getByRole("button", { name: /plat/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /tendre/i }));
    expect(onChange).toHaveBeenCalledWith(["starter:tender", "main:tender"]);
  });

  it("service vide : message explicatif", async () => {
    renderIt({ custom: true, entries: [] });
    await userEvent.click(screen.getByRole("button", { name: /plat/i }));
    expect(screen.getByText(/rien ne l'alimente/i)).toBeInTheDocument();
  });

  it("rétablir : visible seulement une fois personnalisé", async () => {
    const onReset = vi.fn();
    const { rerender } = renderIt({ onReset });
    expect(screen.queryByRole("button", { name: /rétablir/i })).toBeNull();
    rerender(
      <EveningCourseSettings
        categories={CATS}
        custom
        entries={["main:tender"]}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /rétablir/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("personnalisé : « • » marque le classement d'origine", async () => {
    renderIt({ custom: true, entries: ["starter:tender"] });
    await userEvent.click(screen.getByRole("button", { name: /entrée/i }));
    expect(screen.getAllByRole("img", { name: /classement d'origine/i }).length).toBeGreaterThan(0);
  });
});
