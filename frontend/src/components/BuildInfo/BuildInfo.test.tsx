import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildInfo } from "./BuildInfo";

const SHA = "432f3f5abcdef0123456789abcdef0123456789a";
const web = { version: "0.0.147", commit: SHA };

describe("BuildInfo", () => {
  it("affiche version + SHA court pour l'application et le serveur", () => {
    render(<BuildInfo web={web} api={{ ...web }} />);
    expect(screen.getAllByText("0.0.147 · 432f3f5")).toHaveLength(2);
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.getByText("Serveur")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("préfixe gh- conservé tel quel (build GitHub)", () => {
    const gh = { version: "gh-1.4.0", commit: SHA };
    render(<BuildInfo web={gh} api={gh} />);
    expect(screen.getAllByText("gh-1.4.0 · 432f3f5")).toHaveLength(2);
  });

  it("API en chargement puis indisponible : la version du bundle reste visible", () => {
    const { rerender } = render(<BuildInfo web={web} api="loading" />);
    expect(screen.getByText("0.0.147 · 432f3f5")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    rerender(<BuildInfo web={web} api="unavailable" />);
    expect(screen.getByText("indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("versions différentes → avertissement (role=status)", () => {
    render(
      <BuildInfo
        web={{ version: "0.0.146", commit: "b7e1cb1" + SHA.slice(7) }}
        api={web}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/même version/);
  });

  it("build dev : pas de commit affiché, jamais d'avertissement", () => {
    render(
      <BuildInfo
        web={{ version: "dev", commit: "" }}
        api={{ version: "0.0.147", commit: SHA }}
      />,
    );
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
