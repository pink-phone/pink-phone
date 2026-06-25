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
import { ReleaseNotes } from "../../components/ReleaseNotes/ReleaseNotes";
import { RELEASE_NOTES, CURRENT_VERSION } from "../../releaseNotes";
import {
  isPinSet,
  setPin as storePin,
  verifyPin,
  clearPin,
  PIN_LENGTH,
} from "../../lib/pin";
import {
  isBiometricSupported,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from "../../lib/biometric";
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
    blindMood?: boolean;
    allowMediaDownload?: boolean;
  };
  members?: { id: string; name: string }[];
  /** Invitation d'un nouveau membre dans CE salon (#52) — code lisible + générateur. */
  inviteCode?: string | null;
  onCreateInvite?: () => void;
  /** Tous les salons de l'utilisateur (multi-space #67) — affiche le sélecteur. */
  spaces?: { id: string; name: string }[];
  currentSpaceId?: string;
  onSwitchSpace?: (id: string) => void;
  onCreateSpace?: (name: string) => Promise<void> | void;
  onJoinSpace?: (token: string) => Promise<void> | void;
  onRenameSpace?: (name: string) => void;
  onTimezoneChange?: (timezone: string) => void;
  /** Active/désactive le vote d'humeur à l'aveugle (portée salon). */
  onBlindMoodChange?: (enabled: boolean) => void;
  /** Défaut du salon « média téléchargeable » des nouveaux posts (#78). */
  onAllowMediaDownloadChange?: (enabled: boolean) => void;
  /** Réactions du salon (ordre + emoji libres). Affichées si fournies. */
  reactions?: ReactionId[];
  allowCustomReactions?: boolean;
  onReactionsChange?: (reactions: ReactionId[], allowCustom: boolean) => void;
  onBack?: () => void;
  onLogout?: () => void;
  /** Révoque toutes les sessions du compte (perte/vol d'appareil), puis déconnecte. */
  onLogoutAll?: () => void;
  /** Compte : nom affiché courant + renommage (PATCH /me). Affiché si fourni. */
  userName?: string;
  onRenameUser?: (name: string) => Promise<void> | void;
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
  inviteCode,
  onCreateInvite,
  spaces,
  currentSpaceId,
  onSwitchSpace,
  onCreateSpace,
  onJoinSpace,
  onRenameSpace,
  onTimezoneChange,
  onBlindMoodChange,
  onAllowMediaDownloadChange,
  reactions,
  allowCustomReactions = true,
  onReactionsChange,
  onBack,
  onLogout,
  onLogoutAll,
  userName,
  onRenameUser,
}: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.resolvedLanguage ?? i18n.language;

  const [theme, setTheme] = useState<Theme>(getTheme());
  const chooseTheme = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  // Notes de version (#90) : concern appareil (comme le thème) — un snapshot
  // localStorage retient la dernière version vue → pastille « Nouveautés ».
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [releaseSeen, setReleaseSeen] = useState(
    () => localStorage.getItem("pp_seen_release") === CURRENT_VERSION,
  );
  const openReleaseNotes = () => {
    setShowReleaseNotes(true);
    localStorage.setItem("pp_seen_release", CURRENT_VERSION);
    setReleaseSeen(true);
  };

  // Verrouillage local par code PIN (concern appareil, comme le thème/la langue).
  const [pinSet, setPinSet] = useState(isPinSet());
  const [pinFlow, setPinFlow] = useState<
    null | "set" | "confirm" | "bio-prompt" | "disable"
  >(null);
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  // Déverrouillage biométrique (device-local, en complément du PIN). La dispo
  // est asynchrone (platform authenticator) → détectée au montage.
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(isBiometricEnabled());
  const [bioBusy, setBioBusy] = useState(false);
  // Échec d'enrôlement biométrie (annulé / refusé / WebAuthn KO) → feedback (UI2-11).
  const [bioError, setBioError] = useState(false);
  useEffect(() => {
    let alive = true;
    isBiometricSupported().then((ok) => alive && setBioSupported(ok));
    return () => {
      alive = false;
    };
  }, []);
  const toggleBiometric = async () => {
    setBioBusy(true);
    setBioError(false);
    try {
      if (bioEnabled) {
        disableBiometric();
        setBioEnabled(false);
      } else if (await enableBiometric()) {
        setBioEnabled(true);
      } else {
        setBioError(true);
      }
    } finally {
      setBioBusy(false);
    }
  };
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
        // Si la biométrie est disponible, proposer de l'activer immédiatement —
        // c'est le meilleur moment (l'utilisateur vient de configurer son code).
        if (bioSupported) {
          setFirstPin("");
          setPinError(null);
          setPinFlow("bio-prompt");
        } else {
          closePinFlow();
        }
      } else {
        setPinError(t("lock.mismatch"));
        setFirstPin("");
        setPinFlow("set");
      }
    } else if (pinFlow === "disable") {
      if (await verifyPin(pin)) {
        clearPin();
        setPinSet(false);
        // Le PIN est le repli de la biométrie : sans lui, on désactive aussi la
        // biométrie (sinon plus de repli si elle échoue).
        disableBiometric();
        setBioEnabled(false);
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
  // Titre de la feuille modale — calculé hors du JSX pour rester type-safe avec
  // "bio-prompt" (qui n'a pas d'entrée dans pinSheet).
  const sheetTitle = (() => {
    if (!pinFlow) return "";
    if (pinFlow === "bio-prompt") return t("lock.bioPromptTitle");
    return pinSheet[pinFlow].title;
  })();

  // Édition du nom du salon (resynchronisé si le nom change ailleurs).
  const [spaceName, setSpaceName] = useState(space?.name ?? "");
  useEffect(() => setSpaceName(space?.name ?? ""), [space?.name]);

  // Édition du nom affiché du compte (resynchronisé si le nom change ailleurs).
  const [displayName, setDisplayName] = useState(userName ?? "");
  useEffect(() => setDisplayName(userName ?? ""), [userName]);
  const [savingName, setSavingName] = useState(false);
  const submitName = async () => {
    const v = displayName.trim();
    if (!v || v === userName || savingName) return;
    setSavingName(true);
    try {
      await onRenameUser?.(v);
    } finally {
      setSavingName(false);
    }
  };

  // Multi-space (#67) : section repliée par défaut (sauf si ≥ 2 salons, où
  // basculer est un vrai besoin) — la plupart des couples n'ont qu'un salon.
  const [spacesOpen, setSpacesOpen] = useState((spaces?.length ?? 0) >= 2);
  // Créer / rejoindre un autre salon depuis les réglages.
  const [newSpaceName, setNewSpaceName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [spaceBusy, setSpaceBusy] = useState(false);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const runSpaceAction = async (fn: () => Promise<void> | void) => {
    setSpaceBusy(true);
    setSpaceError(null);
    try {
      await fn();
      setNewSpaceName("");
      setJoinToken("");
    } catch {
      setSpaceError(t("errors.generic"));
    } finally {
      setSpaceBusy(false);
    }
  };
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            ←
          </button>
        )}
        <h1 className="font-serif text-2xl text-blush-100">{t("settings.title")}</h1>
      </header>

      {userName !== undefined && onRenameUser && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("settings.accountSection")}
          </h2>
          <Surface tone="velvet">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
              }}
            >
              <TextField
                label={t("settings.displayName")}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                loading={savingName}
                disabled={
                  !displayName.trim() ||
                  displayName.trim() === userName ||
                  savingName
                }
              >
                {t("settings.save")}
              </Button>
            </form>
          </Surface>
        </section>
      )}

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

            {/* Membres + invitation d'un nouveau membre (#52) */}
            {members && members.length > 0 && (
              <div className="space-y-2">
                <span className="block text-xs font-medium text-taupe-200">
                  {t("settings.members")}
                </span>
                <p className="text-sm text-taupe-300">
                  {members.map((m) => m.name).join(" · ")}
                </p>
                {onCreateInvite &&
                  (inviteCode ? (
                    <>
                      <code className="block select-all rounded-2xl bg-charcoal-900/60 px-3 py-2 text-center text-base font-medium tracking-wide text-spice-300">
                        {inviteCode}
                      </code>
                      <p className="text-[11px] text-taupe-400">
                        {t("dashboard.inviteHint")}
                      </p>
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={onCreateInvite}>
                      {t("settings.inviteMember")}
                    </Button>
                  ))}
              </div>
            )}


            {/* Vote d'humeur à l'aveugle */}
            {onBlindMoodChange && (
              <Toggle
                checked={space.blindMood ?? false}
                onChange={onBlindMoodChange}
                label={t("settings.blindMood")}
                hint={t("settings.blindMoodHint")}
              />
            )}

            {/* Défaut « média téléchargeable » des nouveaux posts (#78) */}
            {onAllowMediaDownloadChange && (
              <Toggle
                checked={space.allowMediaDownload ?? false}
                onChange={onAllowMediaDownloadChange}
                label={t("settings.allowMediaDownload")}
                hint={t("settings.allowMediaDownloadHint")}
              />
            )}
          </Surface>
        </section>
      )}

      {/* Mes salons (#67) — replié par défaut, après « Notre salon ». */}
      {spaces && spaces.length > 0 && (
        <section className="space-y-3">
          <h2>
            <button
              type="button"
              onClick={() => setSpacesOpen((o) => !o)}
              aria-expanded={spacesOpen}
              className="flex w-full items-center justify-between rounded-2xl px-1 py-1 transition-colors duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500/50"
            >
              <span className="text-xs uppercase tracking-[0.15em] text-taupe-400">
                {t("settings.spacesSection")}
              </span>
              <span className="flex items-center gap-2">
                {/* Indice replié : nom du salon (1) ou nombre (≥ 2). */}
                <span
                  aria-hidden
                  className={cn(
                    "rounded-full border border-charcoal-600/50 px-2 py-0.5 text-[11px] text-taupe-400 transition-opacity duration-300 ease-felt",
                    spacesOpen ? "opacity-0" : "opacity-100",
                  )}
                >
                  {spaces.length === 1
                    ? spaces[0].name
                    : t("settings.spacesHint", { count: spaces.length })}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "text-sm text-taupe-400 transition-transform duration-300 ease-felt",
                    spacesOpen ? "-rotate-180" : "rotate-0",
                  )}
                >
                  ▾
                </span>
              </span>
            </button>
          </h2>

          {spacesOpen && (
            <Surface tone="velvet" className="animate-slide-up motion-reduce:animate-none space-y-4">
              {/* Sélecteur : seulement utile à partir de 2 salons. */}
              {spaces.length >= 2 ? (
                <div
                  role="radiogroup"
                  aria-label={t("settings.spacesSection")}
                  className="space-y-2"
                >
                  {spaces.map((s) => {
                    const active = s.id === currentSpaceId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={active}
                        onClick={() => onSwitchSpace?.(s.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-sm",
                          "transition-all duration-300 ease-felt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500",
                          active
                            ? "border-spice-500/70 bg-bordeaux-700 text-blush-100 shadow-glow"
                            : "border-charcoal-600/60 bg-charcoal-900/40 text-taupe-200 hover:border-spice-400/40 hover:bg-charcoal-700/60",
                        )}
                      >
                        <span className="truncate">{s.name}</span>
                        {active && (
                          <span className="ml-2 shrink-0 rounded-full border border-spice-500/30 px-2 py-0.5 text-[10px] text-blush-200/80">
                            {t("settings.spaceCurrent")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-taupe-300">
                  <span className="text-[11px] text-taupe-400">
                    {t("settings.spaceCurrent")} ·{" "}
                  </span>
                  {spaces[0].name}
                </p>
              )}

              {(onCreateSpace || onJoinSpace) && (
                <hr className="border-charcoal-600/30" />
              )}

              {/* Créer un autre salon */}
              {onCreateSpace && (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = newSpaceName.trim();
                    if (v) void runSpaceAction(() => onCreateSpace(v));
                  }}
                >
                  <TextField
                    label={t("settings.spaceCreate")}
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    loading={spaceBusy}
                    disabled={!newSpaceName.trim() || spaceBusy}
                  >
                    {t("settings.spaceCreateAction")}
                  </Button>
                </form>
              )}

              {/* Rejoindre un autre salon via un code d'invitation */}
              {onJoinSpace && (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = joinToken.trim();
                    if (v) void runSpaceAction(() => onJoinSpace(v));
                  }}
                >
                  <TextField
                    label={t("settings.spaceJoin")}
                    value={joinToken}
                    onChange={(e) => setJoinToken(e.target.value)}
                    placeholder={t("onboarding.joinPlaceholder")}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    loading={spaceBusy}
                    disabled={!joinToken.trim() || spaceBusy}
                  >
                    {t("settings.spaceJoinAction")}
                  </Button>
                </form>
              )}

              {spaceError && (
                <p className="text-xs text-spice-300">{spaceError}</p>
              )}
            </Surface>
          )}
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

          {/* Indice : biométrie disponible une fois le code activé (appareil compatible). */}
          {!pinSet && bioSupported && (
            <p className="text-[11px] text-taupe-400">
              {t("lock.bioHint")}
            </p>
          )}

          {/* Biométrie : repli du PIN, donc proposée seulement si un PIN existe
              ET si l'appareil a un capteur (FaceID/Touch ID/empreinte). */}
          {pinSet && bioSupported && (
            <div className="space-y-2 border-t border-charcoal-600/40 pt-3">
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-2xl">
                  🔓
                </span>
                <div className="leading-tight">
                  <p className="font-serif text-base text-blush-100">
                    {t("lock.bioSettingTitle")}
                  </p>
                  <p className="mt-0.5 text-xs text-taupe-400">
                    {bioEnabled
                      ? t("lock.bioSettingOn")
                      : t("lock.bioSettingOff")}
                  </p>
                </div>
              </div>
              <Button
                variant={bioEnabled ? "ghost" : "secondary"}
                size="sm"
                className="w-full"
                loading={bioBusy}
                onClick={toggleBiometric}
              >
                {bioEnabled ? t("lock.bioDisable") : t("lock.bioEnable")}
              </Button>
              {bioError && (
                <p role="alert" className="text-xs text-spice-300">
                  {t("lock.bioFailed")}
                </p>
              )}
            </div>
          )}
        </Surface>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
          {t("settings.aboutSection")}
        </h2>
        <Surface tone="velvet">
          <button
            type="button"
            onClick={openReleaseNotes}
            className="flex w-full items-center gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
          >
            <span aria-hidden className="text-2xl">
              ✨
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-serif text-base text-blush-100">
                {t("settings.releaseNotes")}
              </p>
              <p className="mt-0.5 text-xs text-taupe-400">
                {t("settings.releaseNotesHint")}
              </p>
            </div>
            {!releaseSeen && (
              <span className="shrink-0 rounded-full bg-spice-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blush-50">
                {t("settings.releaseNotesNew")}
              </span>
            )}
          </button>
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
                className="block w-full rounded-2xl px-4 py-2.5 text-center text-xs text-taupe-300 underline underline-offset-2 transition-colors duration-300 ease-felt hover:text-spice-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                {t("settings.logoutAll")}
              </button>
              <p className="text-center text-[11px] text-taupe-300">
                {t("settings.logoutAllHint")}
              </p>
            </>
          )}
        </section>
      )}

      <Sheet
        open={pinFlow !== null}
        title={sheetTitle}
        onClose={closePinFlow}
      >
        {pinFlow === "bio-prompt" ? (
          /* Étape de proposition biométrique : juste après la confirmation du PIN.
             Pas de pavé numérique — on propose simplement d'enrôler la biométrie. */
          <div className="flex flex-col items-center gap-6 pb-4 pt-2 text-center">
            <span aria-hidden className="text-5xl">
              🔓
            </span>
            <p className="text-sm text-taupe-300">
              {t("lock.bioPromptSubtitle")}
            </p>
            {bioError && (
              <p role="alert" className="text-xs text-spice-300">
                {t("lock.bioFailed")}
              </p>
            )}
            <div className="flex w-full flex-col gap-3">
              <Button
                className="w-full"
                loading={bioBusy}
                onClick={async () => {
                  setBioBusy(true);
                  setBioError(false);
                  try {
                    // Succès → on ferme ; échec → on garde l'étape + message (UI2-11).
                    if (await enableBiometric()) {
                      setBioEnabled(true);
                      closePinFlow();
                    } else {
                      setBioError(true);
                    }
                  } finally {
                    setBioBusy(false);
                  }
                }}
              >
                {t("lock.bioPromptEnable")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={closePinFlow}>
                {t("lock.bioPromptSkip")}
              </Button>
            </div>
          </div>
        ) : (
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
        )}
      </Sheet>

      <Sheet
        open={showReleaseNotes}
        title={t("releaseNotes.title")}
        onClose={() => setShowReleaseNotes(false)}
      >
        <div className="pb-4">
          <ReleaseNotes notes={RELEASE_NOTES} />
        </div>
      </Sheet>
    </div>
  );
}
