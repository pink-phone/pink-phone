import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { EveningMenuScreen } from "./EveningMenuScreen";
import type { ApiEveningMenuItem } from "../../api/types";

const d = (code: string, over: Partial<ApiEveningMenuItem> = {}): ApiEveningMenuItem => ({
  code,
  picked: false,
  matched: false,
  ...over,
});

describe("EveningMenuScreen", () => {
  it("rend le menu (libellés i18n)", () => {
    render(<EveningMenuScreen items={[d("massage"), d("cuddle")]} />);
    expect(screen.getByText("Un massage")).toBeInTheDocument();
  });

  it("bouton retour appelle onBack", async () => {
    const onBack = vi.fn();
    render(<EveningMenuScreen items={[d("massage")]} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /retour/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("clic sur une puce appelle onToggle avec le code", async () => {
    const onToggle = vi.fn();
    render(<EveningMenuScreen items={[d("massage")]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /ce soir/i }));
    expect(onToggle).toHaveBeenCalledWith("massage");
  });
});
