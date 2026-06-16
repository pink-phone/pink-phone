import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { Toggle } from "../../components/form/Toggle";
import { TextField } from "../../components/form/TextField";
import { cn } from "../../lib/cn";
import { SUPPORTED_LANGS } from "../../i18n";
import type { NotifMode } from "../../api/types";

// Liste IANA complète si le navigateur la fournit, sinon un repli raisonnable.
const TIMEZONES: string[] = (() => {
  const intl = Intl as { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();
const TZ_FALLBACK = [
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

// Modes de notif : id + emoji + flag "bientôt" ; titres/descriptions via i18n.
const MODES: { id: NotifMode; emoji: string; soon?: boolean }[] = [
  { id: "push", emoji: "🔔" },
  { id: "digest", emoji: "📬", soon: true },
  { id: "ghost", emoji: "🌙" },
];

// Clés i18n par mode (littérales pour le typage de `t`).
const MODE_KEYS = {
  push: { title: "settings.pushModeTitle", desc: "settings.pushModeDesc" },
  digest: { title: "settings.digestModeTitle", desc: "settings.digestModeDesc" },
  ghost: { title: "settings.ghostModeTitle", desc: "settings.ghostModeDesc" },
} as const satisfies Record<NotifMode, { title: string; desc: string }>;

// Noms natifs des langues (non traduits).
const LANG_LABEL: Record<string, string> = { fr: "Français", en: "English" };

export interface SettingsScreenProps {
  notifMode: NotifMode;
  onModeChange: (mode: NotifMode) => void;
  /** Le push est-il supporté par l'appareil ? */
  pushSupported?: boolean;
  /** Message d'erreur (ex: permission refusée). */
  pushError?: string | null;
  busy?: boolean;
  /** Effet « braise » des états chauds (halo + particules). */
  hotAnimEnabled?: boolean;
  onHotAnimChange?: (enabled: boolean) => void;
  /** Réglages du salon (affichés si fournis). */
  space?: { name: string; timezone: string; inviteId: string };
  members?: { id: string; name: string }[];
  onRenameSpace?: (name: string) => void;
  onTimezoneChange?: (timezone: string) => void;
  onBack?: () => void;
  onLogout?: () => void;
}

/** Réglages : mode de notification « à la carte » + apparence + déconnexion. */
export function SettingsScreen({
  notifMode,
  onModeChange,
  pushSupported = true,
  pushError,
  busy,
  hotAnimEnabled = true,
  onHotAnimChange,
  space,
  members,
  onRenameSpace,
  onTimezoneChange,
  onBack,
  onLogout,
}: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.resolvedLanguage ?? i18n.language;

  // Édition du nom du salon (resynchronisé si le nom change ailleurs).
  const [spaceName, setSpaceName] = useState(space?.name ?? "");
  useEffect(() => setSpaceName(space?.name ?? ""), [space?.name]);
  const tzOptions = TIMEZONES.length ? TIMEZONES : TZ_FALLBACK;
  const tzList =
    space && !tzOptions.includes(space.timezone)
      ? [space.timezone, ...tzOptions]
      : tzOptions;
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="rounded-full px-2 py-1 text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
        <h1 className="font-serif text-2xl text-blush-100">{t("settings.title")}</h1>
      </header>

      {space && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("settings.spaceSection")}
          </h2>
          <Surface tone="velvet" className="space-y-4">
            {/* Nom du salon */}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = spaceName.trim();
                if (v && v !== space.name) onRenameSpace?.(v);
              }}
            >
              <TextField
                label={t("settings.spaceName")}
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!spaceName.trim() || spaceName.trim() === space.name}
              >
                {t("settings.save")}
              </Button>
            </form>

            {/* Fuseau horaire */}
            <div className="space-y-1.5">
              <label
                htmlFor="space-tz"
                className="block text-xs font-medium text-taupe-200"
              >
                {t("settings.timezone")}
              </label>
              <select
                id="space-tz"
                value={space.timezone}
                onChange={(e) => onTimezoneChange?.(e.target.value)}
                className="w-full rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2 text-sm text-taupe-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                {tzList.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-taupe-400">
                {t("settings.timezoneHint")}
              </p>
            </div>

            {/* Membres */}
            {members && members.length > 0 && (
              <div className="space-y-1">
                <span className="block text-xs font-medium text-taupe-200">
                  {t("settings.members")}
                </span>
                <p className="text-sm text-taupe-300">
                  {members.map((m) => m.name).join(" · ")}
                </p>
              </div>
            )}

            {/* Identifiant d'invitation */}
            <div className="space-y-1">
              <span className="block text-xs font-medium text-taupe-200">
                {t("settings.inviteId")}
              </span>
              <code className="block select-all break-all rounded-2xl bg-charcoal-900/60 px-3 py-2 text-xs text-spice-300">
                {space.inviteId}
              </code>
            </div>
          </Surface>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("settings.notifications")}
        </h2>

        {!pushSupported && (
          <p className="text-xs text-taupe-400">{t("settings.pushUnavailable")}</p>
        )}

        <div
          role="radiogroup"
          aria-label={t("settings.notifications")}
          className="space-y-2"
        >
          {MODES.map((mode) => {
            const active = notifMode === mode.id;
            const disabled = busy || (mode.id === "push" && !pushSupported);
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onModeChange(mode.id)}
                className="block w-full text-left disabled:opacity-50"
              >
                <Surface
                  tone={active ? "deep" : "velvet"}
                  className={cn(
                    "flex items-start gap-3 transition-all duration-300 ease-felt",
                    active ? "shadow-glow" : "hover:-translate-y-0.5",
                  )}
                >
                  <span aria-hidden className="text-2xl">
                    {mode.emoji}
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-serif text-base",
                          active ? "text-blush-100" : "text-taupe-100",
                        )}
                      >
                        {t(MODE_KEYS[mode.id].title)}
                      </span>
                      {mode.soon && (
                        <span className="rounded-full bg-charcoal-700 px-2 py-0.5 text-[10px] text-taupe-300">
                          {t("settings.soon")}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        active ? "text-blush-200" : "text-taupe-400",
                      )}
                    >
                      {t(MODE_KEYS[mode.id].desc)}
                    </span>
                  </span>
                </Surface>
              </button>
            );
          })}
        </div>

        {pushError && (
          <p className="rounded-2xl bg-bordeaux-700/40 px-3 py-2 text-xs text-blush-200">
            {pushError}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("settings.language")}
        </h2>
        <div role="radiogroup" aria-label={t("settings.language")} className="flex gap-2">
          {SUPPORTED_LANGS.map((lng) => {
            const active = currentLang === lng;
            return (
              <button
                key={lng}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void i18n.changeLanguage(lng)}
                className={cn(
                  "flex-1 rounded-2xl border px-3 py-2 text-sm font-medium",
                  "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
                  active
                    ? "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow"
                    : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40",
                )}
              >
                {LANG_LABEL[lng] ?? lng}
              </button>
            );
          })}
        </div>
      </section>

      {onHotAnimChange && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("settings.appearance")}
          </h2>
          <Surface tone="velvet">
            <Toggle
              checked={hotAnimEnabled}
              onChange={onHotAnimChange}
              label={t("settings.hotAnim")}
              hint={t("settings.hotAnimHint")}
            />
          </Surface>
        </section>
      )}

      {onLogout && (
        <section className="pt-2">
          <Button variant="secondary" className="w-full" onClick={onLogout}>
            {t("common.logout")}
          </Button>
        </section>
      )}
    </div>
  );
}
