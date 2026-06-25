import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnreadDivider } from "./UnreadDivider";

describe("UnreadDivider", () => {
  it("variant `unread` (défaut) : séparateur nommé + libellé visible", () => {
    render(<UnreadDivider label="Non lus" />);
    expect(
      screen.getByRole("separator", { name: "Non lus" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Non lus")).toBeInTheDocument();
  });

  it("variant `alreadyRead` : séparateur nommé aussi", () => {
    render(<UnreadDivider variant="alreadyRead" label="Déjà lu" />);
    expect(
      screen.getByRole("separator", { name: "Déjà lu" }),
    ).toBeInTheDocument();
  });
});
