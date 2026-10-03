import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafeMedia } from "./SafeMedia";

const card = () => screen.getByRole("button", { name: /maintenir pour révéler/ });

beforeEach(() => {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // jsdom n'implémente ni play() ni pause().
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("SafeMedia — chargement paresseux et geste de révélation", () => {
  it("révélation : appelle le loader une fois, affiche l'image, onReveal une seule fois", async () => {
    const loader = vi.fn().mockResolvedValue("blob:a");
    const onReveal = vi.fn();
    render(<SafeMedia loader={loader} alt="photo" onReveal={onReveal} />);
    expect(screen.queryByRole("img")).toBeNull();

    fireEvent.pointerDown(card());
    expect(await screen.findByRole("img", { name: "photo" })).toHaveAttribute("src", "blob:a");
    fireEvent.pointerUp(card());
    fireEvent.pointerDown(card());
    expect(loader).toHaveBeenCalledTimes(1); // URL déjà résolue : pas de rechargement
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("indique le chargement puis l'échec ; une nouvelle révélation retente", async () => {
    let reject!: (e: Error) => void;
    const loader = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => (reject = r)))
      .mockResolvedValueOnce("blob:ok");
    render(<SafeMedia loader={loader} alt="photo" />);
    fireEvent.pointerDown(card());
    expect(await screen.findByText("Chargement…")).toBeInTheDocument();
    await act(async () => reject(new Error("réseau")));
    expect(await screen.findByText(/Média indisponible/)).toBeInTheDocument();

    fireEvent.pointerUp(card());
    fireEvent.pointerDown(card());
    expect(await screen.findByRole("img", { name: "photo" })).toHaveAttribute("src", "blob:ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clavier : Entrée/Espace révèlent, le relâchement masque", async () => {
    render(<SafeMedia src="data:," alt="photo" />);
    const c = card();
    expect(c).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(c, { key: "Enter" });
    expect(c).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyUp(c, { key: "Enter" });
    expect(c).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(c, { key: " " });
    expect(c).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyUp(c, { key: " " });
    fireEvent.keyDown(c, { key: "a" }); // autre touche : ignorée
    expect(c).toHaveAttribute("aria-pressed", "false");
  });

  it("quitter ou annuler le geste masque ; le menu contextuel natif est bloqué", () => {
    render(<SafeMedia src="data:," alt="photo" />);
    const c = card();
    fireEvent.pointerDown(c);
    fireEvent.pointerLeave(c);
    expect(c).toHaveAttribute("aria-pressed", "false");
    fireEvent.pointerDown(c);
    fireEvent.pointerCancel(c);
    expect(c).toHaveAttribute("aria-pressed", "false");
    expect(fireEvent.contextMenu(c)).toBe(false); // preventDefault appelé
  });

  it("éphémère : après une révélation puis le relâchement, le média « s'envole »", async () => {
    render(<SafeMedia src="data:," alt="photo" viewOnce />);
    fireEvent.pointerDown(card());
    fireEvent.pointerUp(card());
    expect(await screen.findByText("Envolé…")).toBeInTheDocument();
    // Consommé : plus de geste possible.
    const gone = screen.getByRole("button", { name: /déjà consommé/ });
    fireEvent.pointerDown(gone);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("l'URL objet est révoquée au démontage", async () => {
    const loader = vi.fn().mockResolvedValue("blob:rev");
    const { unmount } = render(<SafeMedia loader={loader} alt="photo" />);
    fireEvent.pointerDown(card());
    await screen.findByRole("img");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rev");
  });
});

describe("SafeMedia — ratio, agrandissement, vidéo", () => {
  it("ratio : des dimensions connues sont rapportées ; le chargement réel le corrige", async () => {
    const onRatioChange = vi.fn();
    render(<SafeMedia src="data:," alt="photo" width={200} height={100} onRatioChange={onRatioChange} />);
    expect(onRatioChange).toHaveBeenLastCalledWith(2);
    fireEvent.pointerDown(card());
    const img = await screen.findByRole("img");
    Object.defineProperty(img, "naturalWidth", { value: 100, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 400, configurable: true });
    fireEvent.load(img);
    await waitFor(() => expect(onRatioChange).toHaveBeenLastCalledWith(0.25));
  });

  it("agrandir : bouton dédié (indépendant du geste), absent en éphémère", async () => {
    const onExpand = vi.fn();
    const { rerender } = render(<SafeMedia src="data:," alt="photo" onExpand={onExpand} />);
    await userEvent.click(screen.getByRole("button", { name: "Voir en plein écran" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    rerender(<SafeMedia src="data:," alt="photo" onExpand={onExpand} viewOnce />);
    expect(screen.queryByRole("button", { name: "Voir en plein écran" })).toBeNull();
  });

  it("vidéo : lecture pendant le geste, pause au relâchement ; ratio via les métadonnées", async () => {
    const onRatioChange = vi.fn();
    render(<SafeMedia src="data:," alt="clip" kind="video" onRatioChange={onRatioChange} />);
    const c = screen.getByRole("button", { name: /maintenir pour révéler/ });
    fireEvent.pointerDown(c);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 160, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 90, configurable: true });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(onRatioChange).toHaveBeenLastCalledWith(160 / 90));
    fireEvent.pointerUp(c);
    await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled());
  });
});

describe("SafeMedia — téléchargement", () => {
  let clicks: string[];
  beforeEach(() => {
    clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}|${this.getAttribute("href")}`);
    });
  });

  it("source directe : déclenche un <a download> au nom voulu, sans rappeler de loader", async () => {
    render(<SafeMedia src="blob:direct" alt="x" downloadable downloadName="souvenir.jpg" />);
    await userEvent.click(screen.getByRole("button", { name: "Télécharger le média" }));
    expect(clicks).toEqual(["souvenir.jpg|blob:direct"]);
  });

  it("charge à la demande via le loader puis réutilise l'URL", async () => {
    const loader = vi.fn().mockResolvedValue("blob:lazy");
    render(<SafeMedia loader={loader} alt="x" downloadable />);
    const btn = screen.getByRole("button", { name: "Télécharger le média" });
    await userEvent.click(btn);
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]).toBe("pink-phone|blob:lazy");
    await userEvent.click(btn);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(2);
  });

  it("échec du chargement : affiche l'indisponibilité, aucun téléchargement", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("x"));
    render(<SafeMedia loader={loader} alt="x" downloadable />);
    await userEvent.click(screen.getByRole("button", { name: "Télécharger le média" }));
    await waitFor(() => expect(loader).toHaveBeenCalled());
    expect(clicks).toHaveLength(0);
  });

  it("démonté pendant le chargement : l'URL est révoquée, pas de téléchargement", async () => {
    let resolve!: (u: string) => void;
    const loader = vi.fn().mockImplementation(() => new Promise<string>((r) => (resolve = r)));
    const { unmount } = render(<SafeMedia loader={loader} alt="x" downloadable />);
    await userEvent.click(screen.getByRole("button", { name: "Télécharger le média" }));
    unmount();
    await act(async () => resolve("blob:late"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late");
    expect(clicks).toHaveLength(0);
  });
});
