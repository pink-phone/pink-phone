import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChallengeCard } from "./ChallengeCard";
import type { ChallengeStatus } from "./challenge";

const meta = {
  title: "Défis/ChallengeCard",
  component: ChallengeCard,
  tags: ["autodocs"],
  // La carte est désormais pleine largeur (elle s'adapte à l'écran dans l'app) ;
  // on la contraint ici pour conserver un aperçu "carte" en Storybook.
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Un défi et ses actions selon l'état : Proposé → Challenge accepted / Maybe → Job done.",
      },
    },
  },
  argTypes: {
    intensity: { control: "inline-radio", options: ["soft", "hot", "hard"] },
    status: {
      control: "inline-radio",
      options: ["proposed", "challengeAccepted", "maybeMaybe", "jobDone"],
    },
    perspective: { control: "inline-radio", options: ["recipient", "proposer"] },
    onAccept: { action: "accept" },
    onNegotiate: { action: "negotiate" },
    onComplete: { action: "complete" },
  },
  args: {
    title: "Un massage aux huiles, sans téléphone",
    description:
      "Une heure rien que pour toi, lumière tamisée. Tu te laisses faire, c'est tout.",
    intensity: "hot",
    status: "proposed",
    deadlineLabel: "Avant dimanche",
    perspective: "recipient",
  },
} satisfies Meta<typeof ChallengeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Proposé: Story = {};
export const EnCours: Story = { args: { status: "challengeAccepted" } };
export const ÀAdapter: Story = { args: { status: "maybeMaybe" } };
export const Terminé: Story = { args: { status: "jobDone" } };
export const VueProposeur: Story = {
  args: { perspective: "proposer", status: "proposed" },
};

export const CycleDeVie: Story = {
  name: "Cycle de vie (interactif)",
  render: (args) => {
    const [status, setStatus] = useState<ChallengeStatus>("proposed");
    return (
      <div className="space-y-3">
        <ChallengeCard
          {...args}
          status={status}
          onAccept={() => setStatus("challengeAccepted")}
          onNegotiate={() => setStatus("maybeMaybe")}
          onComplete={() => setStatus("jobDone")}
        />
        <button
          type="button"
          onClick={() => setStatus("proposed")}
          className="text-xs text-taupe-400 underline-offset-2 hover:underline"
        >
          ↺ Recommencer
        </button>
      </div>
    );
  },
};
