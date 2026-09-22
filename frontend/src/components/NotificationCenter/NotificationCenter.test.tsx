import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationCenter } from "./NotificationCenter";

describe("NotificationCenter", () => {
  it("affiche l'état vide sans notifications", () => {
    render(
      <NotificationCenter open items={[]} onOpen={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/rien de nouveau/i)).toBeTruthy();
  });

  it("ouvre une notification non lue au tap", () => {
    const onOpen = vi.fn();
    render(
      <NotificationCenter
        open
        items={[
          {
            id: "n1",
            kind: "post",
            actorName: "Alex",
            read: false,
            timeLabel: "il y a 2 min",
          },
        ]}
        onOpen={onOpen}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ouvrir/i }));
    expect(onOpen).toHaveBeenCalledWith("n1");
  });

  it("une notification déjà lue reste ouvrable (navigation, pas juste marquer lu)", () => {
    const onOpen = vi.fn();
    render(
      <NotificationCenter
        open
        items={[
          {
            id: "n1",
            kind: "challenge",
            actorName: "Alex",
            read: true,
            timeLabel: "il y a 2 j",
          },
        ]}
        onOpen={onOpen}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ouvrir/i }));
    expect(onOpen).toHaveBeenCalledWith("n1");
  });

  it("n'affiche le bouton \"tout marquer\" que s'il reste du non lu", () => {
    const { rerender } = render(
      <NotificationCenter
        open
        items={[
          {
            id: "n1",
            kind: "post",
            actorName: "Alex",
            read: false,
            timeLabel: "il y a 2 min",
          },
        ]}
        onOpen={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/tout marquer/i)).toBeTruthy();

    rerender(
      <NotificationCenter
        open
        items={[
          {
            id: "n1",
            kind: "post",
            actorName: "Alex",
            read: true,
            timeLabel: "il y a 2 min",
          },
        ]}
        onOpen={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/tout marquer/i)).toBeNull();
  });

  it("ignore un type de notification inconnu", () => {
    render(
      <NotificationCenter
        open
        items={[
          {
            id: "n1",
            kind: "typeInconnu",
            actorName: null,
            read: false,
            timeLabel: "il y a 2 min",
          },
        ]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/rien de nouveau/i)).toBeTruthy();
  });
});
