import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnreadDivider } from "./UnreadDivider";

const meta = {
  title: "Communs/UnreadDivider",
  component: UnreadDivider,
  tags: ["autodocs"],
  args: { label: "Unread" },
} satisfies Meta<typeof UnreadDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Variante par défaut — tête du bloc non lu (ton braise). */
export const Default: Story = {};

/** Variante "déjà lu" — pied du bloc non lu (ton neutre). */
export const AlreadyRead: Story = {
  args: { label: "Already seen", variant: "alreadyRead" },
};

const Card = ({ dim, children }: { dim?: boolean; children: string }) => (
  <div
    className={`rounded-2xl bg-charcoal-700 p-4 text-sm ${
      dim ? "text-taupe-400" : "text-taupe-100"
    }`}
  >
    {children}
  </div>
);

/**
 * Usage nominal dans un fil anté-chronologique : les deux marqueurs forment un
 * sandwich autour du bloc non lu. La variante `unread` (braise) attire l'œil vers
 * le haut ; la variante `alreadyRead` (neutre) signale discrètement la frontière
 * avant les contenus déjà vus.
 */
export const InAFeed: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <UnreadDivider label="Unread" variant="unread" />
      <Card>Fresh confession</Card>
      <Card>Another new one</Card>
      <UnreadDivider label="Already seen" variant="alreadyRead" />
      <Card dim>Already seen</Card>
      <Card dim>Older, already seen</Card>
    </div>
  ),
};

/** Quand tout le fil est non lu : seule la tête s'affiche, aucun pied orphelin. */
export const AllUnread: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <UnreadDivider label="Unread" variant="unread" />
      <Card>Fresh confession</Card>
      <Card>Another new one</Card>
      <Card>One more</Card>
    </div>
  ),
};
