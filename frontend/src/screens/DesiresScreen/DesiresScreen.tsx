import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { DesireCard } from "../../components/DesireCard/DesireCard";
import type { ApiDesire } from "../../api/types";

export interface DesiresScreenProps {
  /** Catalogue + mon intérêt + match + réalisé (déjà chargé par l'orchestration). */
  items: ApiDesire[];
  /** Bascule mon intérêt pour une envie (par code). */
  onToggle?: (code: string) => void;
  /** Bascule « ✓ Réalisé » (couple) pour une envie (par code). */
  onToggleDone?: (code: string) => void;
  onBack?: () => void;
}

// Code stable → clé i18n typée. Mêmes 34 codes que la const Rust
// `DESIRE_CATEGORIES` (source de vérité ; #99).
const LABEL_KEYS = {
  morningCuddle: "desires.items.morningCuddle",
  oilMassage: "desires.items.oilMassage",
  bathTogether: "desires.items.bathTogether",
  slowDance: "desires.items.slowDance",
  lingerie: "desires.items.lingerie",
  rediscover: "desires.items.rediscover",
  roleplay: "desires.items.roleplay",
  truthOrDare: "desires.items.truthOrDare",
  striptease: "desires.items.striptease",
  photoSession: "desires.items.photoSession",
  writeFantasy: "desires.items.writeFantasy",
  daySexting: "desires.items.daySexting",
  kamaPosition: "desires.items.kamaPosition",
  mirror: "desires.items.mirror",
  tantric: "desires.items.tantric",
  spooning: "desires.items.spooning",
  newPositionMonthly: "desires.items.newPositionMonthly",
  blindfold: "desires.items.blindfold",
  lightBondage: "desires.items.lightBondage",
  spanking: "desires.items.spanking",
  temperature: "desires.items.temperature",
  edging: "desires.items.edging",
  toy: "desires.items.toy",
  gentleDomination: "desires.items.gentleDomination",
  submission: "desires.items.submission",
  commands: "desires.items.commands",
  softCollar: "desires.items.softCollar",
  eveningRules: "desires.items.eveningRules",
  outdoors: "desires.items.outdoors",
  car: "desires.items.car",
  hotel: "desires.items.hotel",
  anotherRoom: "desires.items.anotherRoom",
  semiPublic: "desires.items.semiPublic",
  voyeur: "desires.items.voyeur",
} as const;

const CATEGORY_KEYS = {
  tender: "desires.categories.tender",
  games: "desires.categories.games",
  kamasutra: "desires.categories.kamasutra",
  sensations: "desires.categories.sensations",
  power: "desires.categories.power",
  places: "desires.categories.places",
} as const;

const CATEGORY_ORDER = [
  "tender",
  "games",
  "kamasutra",
  "sensations",
  "power",
  "places",
] as const;

/** Écran dédié « Bucket list » (#99) : envies rangées par catégorie (sections
 *  repliables). On coche en secret (→ match) et on marque « ✓ Réalisé ». */
export function DesiresScreen({
  items,
  onToggle,
  onToggleDone,
  onBack,
}: DesiresScreenProps) {
  const { t } = useTranslation();
  // Catégories ouvertes (repliées par défaut → écran épuré, on explore au tap).
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const known = items.filter(
    (d): d is ApiDesire & { code: keyof typeof LABEL_KEYS } =>
      d.code in LABEL_KEYS,
  );

  return (
    <div className="space-y-5">
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

      <div className="space-y-3">
        {CATEGORY_ORDER.map((cat) => {
          const inCat = known.filter((d) => d.category === cat);
          if (inCat.length === 0) return null;
          const matches = inCat.filter((d) => d.matched).length;
          const dones = inCat.filter((d) => d.done).length;
          const isOpen = open[cat] ?? false;
          return (
            <section key={cat} className="space-y-3">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-charcoal-600/60 bg-charcoal-800/60 px-4 py-3 text-left transition-colors duration-300 ease-felt hover:border-spice-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
              >
                <span className="font-serif text-base text-blush-100">
                  {t(CATEGORY_KEYS[cat])}
                </span>
                <span className="flex items-center gap-2">
                  {matches > 0 && (
                    <span className="rounded-full border border-spice-500/70 bg-bordeaux-700 px-2 py-0.5 text-xs text-blush-100 shadow-glow">
                      ✨ {matches}
                    </span>
                  )}
                  {dones > 0 && (
                    <span className="rounded-full bg-spice-500/20 px-2 py-0.5 text-xs text-spice-200">
                      ✓ {dones}
                    </span>
                  )}
                  <span aria-hidden className="text-xs text-taupe-400">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3">
                  {inCat.map((d) => (
                    <Fragment key={d.code}>
                      <DesireCard
                        label={t(LABEL_KEYS[d.code])}
                        interested={d.interested}
                        matched={d.matched}
                        done={d.done}
                        onToggle={() => onToggle?.(d.code)}
                        onToggleDone={
                          onToggleDone ? () => onToggleDone(d.code) : undefined
                        }
                      />
                    </Fragment>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
