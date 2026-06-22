import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../components/Surface/Surface";
import { Button } from "../../components/Button/Button";
import { Toggle } from "../../components/form/Toggle";
import { TextField } from "../../components/form/TextField";
import { ReactionSettings } from "../../components/ReactionSettings/ReactionSettings";
import type { ReactionId } from "../../components/ReactionBar/ReactionBar";
import { Sheet } from "../../components/Sheet/Sheet";
import { LockScreen } from "../../components/LockScreen/LockScreen";
import {
  isPinSet,
  setPin as storePin,
  verifyPin,
  clearPin,
  PIN_LENGTH,
} from "../../lib/pin";
import { cn } from "../../lib/cn";
import { SUPPORTED_LANGS } from "../../i18n";
import { THEMES, applyTheme, getTheme, type Theme } from "../../theme";
import type { NotifMode } from "../../api/types";

const THEME_LABEL_KEY = {
  felted: "settings.themeFelted",
  "red-velvet": "settings.themeRedVelvet",
} as const satisfies Record<Theme, string>;

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
// « digest » (résumé quotidien) retiré du picker : la livraison email n'est pas
// implémentée (backlog #66). Le type NotifMode garde la valeur (inoffensive).
const MODES: { id: NotifMode; emoji: string }[] = [
  { id: "push", emoji: "🔔" },
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
  space?: {
    name: string;
    timezone: string;
    inviteId: string;
    blindMood?: boolean;
  };
  members?: { id: string; name: string }[];
  onRenameSpace?: (name: string) => void;
  onTimezoneChange?: (timezone: string) => void;
  /** Active/désactive le vote d'humeur à l'aveugle (portée salon). */
  onBlindMoodChange?: (enabled: boolean) => void;
  /** Réactions du salon (ordre + emoji libres). Affichées si fournies. */
  reactions?: ReactionId[];
  allowCustomReactions?: boolean;
  onReactionsChange?: (reactions: ReactionId[], allowCustom: boolean) => void;
  onBack?: () => void;
  onLogout?: () => void;
  /** Révoque toutes les sessions du compte (perte/vol d'appareil), puis déconnecte. */
  onLogoutAll?: () => void;
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
  onBlindMoodChange,
  reactions,
  allowCustomReactions = true,
  onReactionsChange,
  onBack,
  onLogout,
  onLogoutAll,
}: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.resolvedLanguage ?? i18n.language;

  const [theme, setTheme] = useState<Theme>(getTheme());
  const chooseTheme = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  // Verrouillage local par code PIN (concern appareil, comme le thème/la langue).
  const [pinSet, setPinSet] = useState(isPinSet());
  const [pinFlow, setPinFlow] = useState<null | "set" | "confirm" | "disable">(
    null,
  );
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const closePinFlow = () => {
    setPinFlow(null);
    setFirstPin("");
    setPinError(null);
  };
  const handlePinSubmit = async (pin: string) => {
    if (pinFlow === "set") {
      setFirstPin(pin);
      setPinError(null);
      setPinFlow("confirm");
    } else if (pinFlow === "confirm") {
      if (pin === firstPin) {
        await storePin(pin);
        setPinSet(true);
        closePinFlow();
      } else {
        setPinError(t("lock.mismatch"));
        setFirstPin("");
        setPinFlow("set");
      }
    } else if (pinFlow === "disable") {
      if (await verifyPin(pin)) {
        clearPin();
        setPinSet(false);
        closePinFlow();
      } else {
        setPinError(t("lock.wrong"));
      }
    }
  };
  const pinSheet = {
    set: { title: t("lock.setTitle"), subtitle: t("lock.setSubtitle") },
    confirm: {
      title: t("lock.confirmTitle"),
      subtitle: t("lock.confirmSubtitle"),
    },
    disable: {
      title: t("lock.disableTitle"),
      subtitle: t("lock.disableSubtitle"),
    },
  };

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
              {/* Chevron custom (UI-UX8) : le picker natif reste utilisé au tap
                  (liste IANA longue), mais sans le chevron natif iOS hétérogène. */}
              <div className="relative">
                <select
                  id="space-tz"
                  value={space.timezone}
                  onChange={(e) => onTimezoneChange?.(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-charcoal-600/60 bg-charcoal-800 px-3 py-2 pr-9 text-sm text-taupe-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
                >
                  {tzList.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-taupe-300"
                >
                  ▾
                </span>
              </div>
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

            {/* Vote d'humeur à l'aveugle */}
            {onBlindMoodChange && (
              <Toggle
                checked={space.blindMood ?? false}
                onChange={onBlindMoodChange}
                label={t("settings.blindMood")}
                hint={t("settings.blindMoodHint")}
              />
            )}
          </Surface>
        </section>
      )}

      {reactions && onReactionsChange && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("settings.reactionsSection")}
          </h2>
          <Surface tone="velvet">
            <ReactionSettings
              value={reactions}
              allowCustom={allowCustomReactions}
              onChange={onReactionsChange}
            />
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

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("settings.appearance")}
        </h2>
        <Surface tone="velvet" className="space-y-4">
            {/* Thème */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-taupe-200">
                {t("settings.theme")}
              </span>
              <div
                role="radiogroup"
                aria-label={t("settings.theme")}
                className="flex gap-2"
              >
                {THEMES.map((th) => {
                  const active = theme === th;
                  return (
                    <button
                      key={th}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseTheme(th)}
                      className={cn(
                        "flex-1 rounded-2xl border px-3 py-2 text-sm font-medium",
                        "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
                        active
                          ? "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow"
                          : "border-charcoal-600/60 bg-charcoal-800 text-taupe-300 hover:border-spice-400/40",
                      )}
                    >
                      {t(THEME_LABEL_KEY[th])}
                    </button>
                  );
                })}
              </div>
            </div>

            {onHotAnimChange && (
              <Toggle
                checked={hotAnimEnabled}
                onChange={onHotAnimChange}
                label={t("settings.hotAnim")}
                hint={t("settings.hotAnimHint")}
              />
            )}
          </Surface>
        </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("settings.securitySection")}
        </h2>
        <Surface tone="velvet" className="space-y-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl">
              🔒
            </span>
            <div className="leading-tight">
              <p className="font-serif text-base text-blush-100">
                {t("lock.settingTitle")}
              </p>
              <p className="mt-0.5 text-xs text-taupe-400">
                {pinSet ? t("lock.settingOn") : t("lock.settingOff")}
              </p>
            </div>
          </div>
          {pinSet ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPinError(null);
                  setFirstPin("");
                  setPinFlow("set");
                }}
              >
                {t("lock.change")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPinError(null);
                  setPinFlow("disable");
                }}
              >
                {t("lock.disable")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setPinError(null);
                setFirstPin("");
                setPinFlow("set");
              }}
            >
              {t("lock.enable")}
            </Button>
          )}
        </Surface>
      </section>

      {(onLogout || onLogoutAll) && (
        <section className="space-y-2 pt-2">
          {onLogout && (
            <Button variant="secondary" className="w-full" onClick={onLogout}>
              {t("common.logout")}
            </Button>
          )}
          {onLogoutAll && (
            <>
              <button
                type="button"
                onClick={onLogoutAll}
                className="w-full text-center text-xs text-taupe-300 underline underline-offset-2 transition-colors duration-300 ease-felt hover:text-spice-300"
              >
                {t("settings.logoutAll")}
              </button>
              <p className="text-center text-[11px] text-taupe-400">
                {t("settings.logoutAllHint")}
              </p>
            </>
          )}
        </section>
      )}

      <Sheet
        open={pinFlow !== null}
        title={pinFlow ? pinSheet[pinFlow].title : ""}
        onClose={closePinFlow}
      >
        <div className="flex justify-center pb-4">
          {pinFlow && (
            <LockScreen
              key={pinFlow}
              title={pinSheet[pinFlow].title}
              subtitle={pinSheet[pinFlow].subtitle}
              error={pinError}
              pinLength={PIN_LENGTH}
              onSubmit={handlePinSubmit}
              onCancel={closePinFlow}
            />
          )}
        </div>
      </Sheet>
    </div>
  );
}
