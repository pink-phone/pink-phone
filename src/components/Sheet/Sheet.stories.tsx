import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { Sheet } from "./Sheet";
import { Button } from "../Button/Button";

const meta = {
  title: "Fondations/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { open: true, title: "Un titre feutré", onClose: fn(), children: null },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <div className="flex h-dvh items-center justify-center">
        <Button onClick={() => setOpen(true)}>Ouvrir la feuille</Button>
        <Sheet open={open} title="Un titre feutré" onClose={() => setOpen(false)}>
          <p className="text-sm text-taupe-200">
            Le contenu glisse depuis le bas, doucement. Clic sur le voile ou Échap
            pour refermer.
          </p>
        </Sheet>
      </div>
    );
  },
};
