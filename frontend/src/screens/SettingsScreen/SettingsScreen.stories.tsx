import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { SettingsScreen } from "./SettingsScreen";
import type { NotifMode } from "../../api/types";

const meta = {
  title: "Écrans/SettingsScreen",
  component: SettingsScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    notifMode: "push",
    onModeChange: fn(),
    onHotAnimChange: fn(),
    hotAnimEnabled: true,
    space: {
      name: "Pink Phone",
      timezone: "Europe/Paris",
      blindMood: false,
    },
    members: [
      { id: "1", name: "You" },
      { id: "2", name: "Camille" },
    ],
    onRenameSpace: fn(),
    onTimezoneChange: fn(),
    onBlindMoodChange: fn(),
    onBack: fn(),
    onLogout: fn(),
  },
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactif: Story = {
  render: (args) => {
    const [mode, setMode] = useState<NotifMode>(args.notifMode);
    const [hotAnim, setHotAnim] = useState(args.hotAnimEnabled ?? true);
    return (
      <div className="w-[380px]">
        <SettingsScreen
          {...args}
          notifMode={mode}
          onModeChange={(m) => {
            setMode(m);
            args.onModeChange(m);
          }}
          hotAnimEnabled={hotAnim}
          onHotAnimChange={(v) => {
            setHotAnim(v);
            args.onHotAnimChange?.(v);
          }}
        />
      </div>
    );
  },
};

export const PushIndisponible: Story = {
  args: { notifMode: "ghost", pushSupported: false },
  render: (args) => (
    <div className="w-[380px]">
      <SettingsScreen {...args} />
    </div>
  ),
};

export const AvecErreur: Story = {
  args: { notifMode: "push", pushError: "Permission de notification refusée." },
  render: (args) => (
    <div className="w-[380px]">
      <SettingsScreen {...args} />
    </div>
  ),
};
