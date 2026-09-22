import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NotificationCenter } from "./NotificationCenter";

const meta = {
  title: "Composants/NotificationCenter",
  component: NotificationCenter,
  tags: ["autodocs"],
  args: {
    open: true,
    onOpen: fn(),
    onMarkAllRead: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof NotificationCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixteLuEtNonLu: Story = {
  args: {
    items: [
      {
        id: "1",
        kind: "post",
        actorName: "Alex",
        entityId: "post-1",
        read: false,
        timeLabel: "il y a 2 min",
      },
      {
        id: "2",
        kind: "comment",
        actorName: "Alex",
        entityId: "post-1",
        read: false,
        timeLabel: "il y a 1 h",
      },
      {
        id: "3",
        kind: "eveningMenu",
        actorName: null,
        entityId: "cuddle",
        read: true,
        timeLabel: "hier",
      },
      {
        id: "4",
        kind: "memberJoined",
        actorName: "Sam",
        entityId: null,
        read: true,
        timeLabel: "la semaine dernière",
      },
    ],
  },
};

export const ToutLu: Story = {
  args: {
    items: [
      {
        id: "1",
        kind: "loveNote",
        actorName: "Alex",
        entityId: null,
        read: true,
        timeLabel: "il y a 3 j",
      },
    ],
  },
};

export const Vide: Story = {
  args: { items: [] },
};

export const Chargement: Story = {
  args: { items: [], loading: true },
};
