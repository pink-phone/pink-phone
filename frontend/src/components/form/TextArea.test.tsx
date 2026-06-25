import { describe, it, expect } from "vitest";
import { useRef, useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("associe le label, applique `rows` et le hint", () => {
    render(<TextArea label="Récit" hint="Prends ton temps" rows={8} />);
    const ta = screen.getByLabelText("Récit");
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta).toHaveAttribute("rows", "8");
    expect(screen.getByText("Prends ton temps")).toBeInTheDocument();
  });

  it("forwardRef : la ref pointe sur le <textarea> (focus programmatique)", () => {
    function Harness() {
      const ref = useRef<HTMLTextAreaElement>(null);
      useEffect(() => ref.current?.focus(), []);
      return <TextArea label="Note" ref={ref} />;
    }
    render(<Harness />);
    expect(screen.getByLabelText("Note")).toHaveFocus();
  });
});
