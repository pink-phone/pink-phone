import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockScreen } from "./LockScreen";

const meta = {
  title: "Sécurité/LockScreen",
  component: LockScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Saisie d'un code PIN au pavé numérique. Garde-fou local : verrouille l'app à la réouverture pour qu'un tiers ne voie pas le contenu intime. Auto-soumission une fois la longueur atteinte.",
      },
    },
  },
  args: {
    title: "Code de déverrouillage",
    subtitle: "Saisis ton code à 4 chiffres",
    pinLength: 4,
    onSubmit: () => {},
  },
  argTypes: {
    onCancel: { action: "cancel" },
  },
} satisfies Meta<typeof LockScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Déverrouillage: Story = {};

export const CodeIncorrect: Story = {
  args: { error: "Code incorrect. Réessaie." },
};

export const DéfinirUnCode: Story = {
  name: "Définir un code (réglages)",
  args: {
    title: "Choisis un code",
    subtitle: "4 chiffres, à retenir",
    onCancel: () => {},
  },
};
