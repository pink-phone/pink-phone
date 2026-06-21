import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostComposer } from "./PostComposer";

describe("PostComposer", () => {
  it("le bouton Publier est désactivé tant qu'il n'y a ni récit ni média", () => {
    render(<PostComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^publier$/i })).toBeDisabled();
  });

  it("saisir un récit active la publication et onSubmit reçoit le body", async () => {
    const onSubmit = vi.fn();
    render(<PostComposer onSubmit={onSubmit} />);

    const body = screen.getByPlaceholderText("Raconte, à tête reposée…");
    await userEvent.type(body, "Un souvenir");

    const publish = screen.getByRole("button", { name: /^publier$/i });
    expect(publish).toBeEnabled();

    await userEvent.click(publish);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      body: "Un souvenir",
      draft: false,
    });
  });
});
