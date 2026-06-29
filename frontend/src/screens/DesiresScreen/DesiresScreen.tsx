import { useTranslation } from "react-i18next";
import { DesireCard } from "../../components/DesireCard/DesireCard";
import type { ApiDesire } from "../../api/types";

export interface DesiresScreenProps {
  /** Catalogue + mon intérêt + état « matché » (déjà chargé par l'orchestration). */
  items: ApiDesire[];
  /** Bascule mon intérêt pour une envie (par code). */
  onToggle?: (code: string) => void;
  onBack?: () => void;
}

// Code stable du catalogue → clé i18n typée du libellé. Mêmes 12 codes que la
// const Rust `DESIRE_CODES` (source de vérité ; #99). Un code absent d'ici est
// simplement ignoré à l'affichage.
const LABEL_KEYS = {
  massage: "desires.items.massage",
  roleplay: "desires.items.roleplay",
  blindfold: "desires.items.blindfold",
  newPlace: "desires.items.newPlace",
  shower: "desires.items.shower",
  slowHands: "desires.items.slowHands",
  toys: "desires.items.toys",
  photoSession: "desires.items.photoSession",
  powerPlay: "desires.items.powerPlay",
  outdoorThrill: "desires.items.outdoorThrill",
  morningTime: "desires.items.morningTime",
  writeFantasy: "desires.items.writeFantasy",
} as const;

/** Écran dédié « Vos envies » (#99) : on coche en secret, ça se révèle en match. */
export function DesiresScreen({ items, onToggle, onBack }: DesiresScreenProps) {
  const { t } = useTranslation();

  const known = items.filter(
    (d): d is ApiDesire & { code: keyof typeof LABEL_KEYS } =>
      d.code in LABEL_KEYS,
  );
  const matches = known.filter((d) => d.matched);
  const others = known.filter((d) => !d.matched);

  const card = (d: ApiDesire & { code: keyof typeof LABEL_KEYS }) => (
    <DesireCard
      key={d.code}
      label={t(LABEL_KEYS[d.code])}
      interested={d.interested}
      matched={d.matched}
      onToggle={() => onToggle?.(d.code)}
    />
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-taupe-300 transition-colors duration-300 ease-felt hover:text-blush-100"
          >
            ←
          </button>
        )}
        <h1 className="flex-1 font-serif text-2xl text-blush-100">
          {t("desires.title")}
        </h1>
      </header>

      <p className="text-sm text-taupe-300">{t("desires.intro")}</p>

      {matches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-spice-300">
            {t("desires.matchesHeader")}
          </h2>
          <div className="flex flex-col gap-3">{matches.map(card)}</div>
        </section>
      )}

      <section className="space-y-3">
        {matches.length > 0 && (
          <h2 className="text-xs uppercase tracking-[0.15em] text-taupe-400">
            {t("desires.othersHeader")}
          </h2>
        )}
        <div className="flex flex-col gap-3">{others.map(card)}</div>
      </section>
    </div>
  );
}
