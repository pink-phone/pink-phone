import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoodSelector, parseCustomMood } from "./MoodSelector";

describe("MoodSelector — humeurs prédéfinies", () => {
  it("affiche les 5 humeurs et marque l'active", () => {
    render(<MoodSelector value="flirty" />);
    expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole("radio", { name: "Taquin·e" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Calme" })).toHaveAttribute("aria-checked", "false");
  });

  it("choisir une humeur → onChange(id)", async () => {
    const onChange = vi.fn();
    render(<MoodSelector onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Calme" }));
    expect(onChange).toHaveBeenCalledWith("calm");
  });

  it("recliquer sur l'humeur active → onClear (désélection)", async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<MoodSelector value="calm" onChange={onChange} onClear={onClear} />);
    await userEvent.click(screen.getByRole("radio", { name: "Calme" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("très chaud actif : braises affichées, sans erreur", () => {
    render(<MoodSelector value="veryHot" />);
    expect(screen.getByRole("radio", { name: "Très chaud·e" })).toHaveAttribute("aria-checked", "true");
  });

  it("allowCustom=false : pas de ligne « humeur libre »", () => {
    render(<MoodSelector allowCustom={false} />);
    expect(screen.queryByRole("radio", { name: "Humeur libre" })).toBeNull();
    expect(screen.queryByText("ou")).toBeNull();
  });
});

describe("MoodSelector — humeur libre", () => {
  it("saisir emoji + libellé → onChange(« emoji libellé »), éditeur refermé", async () => {
    const onChange = vi.fn();
    render(<MoodSelector onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Humeur libre" }));
    await userEvent.type(screen.getByLabelText("Emoji de l'humeur libre"), "😈");
    await userEvent.type(screen.getByLabelText("Libellé de l'humeur libre"), "joueur");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onChange).toHaveBeenCalledWith("😈 joueur");
    expect(screen.queryByLabelText("Emoji de l'humeur libre")).toBeNull();
  });

  it("emoji seul accepté ; formulaire vide → rien n'est émis", async () => {
    const onChange = vi.fn();
    render(<MoodSelector onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Humeur libre" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: "Humeur libre" }));
    await userEvent.type(screen.getByLabelText("Emoji de l'humeur libre"), "🔥");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("🔥");
  });

  it("humeur libre active : tuile = emoji + libellé ; l'éditeur est pré-rempli et permet de retirer", async () => {
    const onClear = vi.fn();
    render(<MoodSelector value="😈 joueur" onClear={onClear} />);
    const tile = screen.getByRole("radio", { name: "Humeur libre — modifier" });
    expect(tile).toHaveAttribute("aria-checked", "true");
    expect(tile).toHaveTextContent("😈");
    expect(tile).toHaveTextContent("joueur");

    await userEvent.click(tile);
    expect(screen.getByLabelText("Emoji de l'humeur libre")).toHaveValue("😈");
    expect(screen.getByLabelText("Libellé de l'humeur libre")).toHaveValue("joueur");
    await userEvent.click(screen.getByRole("button", { name: "Retirer mon humeur" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Emoji de l'humeur libre")).toBeNull();
  });

  it("humeur libre sans libellé : affiche le libellé générique", () => {
    render(<MoodSelector value="🙃" />);
    expect(screen.getByRole("radio", { name: "Humeur libre — modifier" })).toHaveTextContent("Humeur libre");
  });
});

describe("parseCustomMood", () => {
  it("sépare emoji et libellé au premier espace", () => {
    expect(parseCustomMood("😈 très joueur")).toEqual({ emoji: "😈", label: "très joueur" });
    expect(parseCustomMood("😈")).toEqual({ emoji: "😈", label: "" });
  });
});
