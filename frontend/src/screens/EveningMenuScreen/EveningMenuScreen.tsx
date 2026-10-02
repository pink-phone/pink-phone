import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EveningMenu } from "../../components/EveningMenu/EveningMenu";
import { EveningMenuPicker } from "../../components/EveningMenuPicker/EveningMenuPicker";
import { CourseTabs, type Course, type CourseStatus } from "../../components/CourseTabs/CourseTabs";
import { UndoToast } from "../../components/UndoToast/UndoToast";
import { useBackClose } from "../../lib/useBackClose";
import { confirmAction } from "../../lib/confirm";
import type { ApiEveningMenuItem } from "../../api/types";

export interface EveningMenuScreenProps {
  items: ApiEveningMenuItem[];
  /** Registre des libellés : explicite (défaut) ou suggestif (#99), hérité de
   *  la bucket list — le Dessert reprend les items « practices ». */
  explicit?: boolean;
  /** Bascule mon choix. `course` = service où il est ajouté (piocher hors
   *  des catégories du service). */
  onToggle?: (code: string, course?: Course) => void;
  /** Prénom du/de la partenaire (couple) pour les lignes de statut. */
  partnerName?: string;
  /** Mode ouvert (#0040) : refuse une proposition (par code). */
  onRefuse?: (code: string) => void;
  onBack?: () => void;
}

const COURSES: Course[] = ["starter", "main", "dessert"];

function statusOf(items: ApiEveningMenuItem[]): CourseStatus {
  // Une proposition de l'autre (mode ouvert) est « matched » côté serveur tant
  // que je n'ai pas répondu : seul un item que j'ai coché compte comme match.
  if (items.some((i) => i.matched && i.picked)) return "matched";
  if (items.some((i) => i.picked)) return "picked";
  return "neutral";
}

/** Écran dédié « Menu du soir » (#97b) : effet « boîte à secrets », sorti du
 *  dashboard (allègement UX). Depuis #0039, connecté à toute la banque du
 *  catalogue et structuré en 3 services (Entrée/Plat/Dessert, `CourseTabs`),
 *  tous accessibles en permanence — aucun verrouillage séquentiel. Refacto
 *  114d : chaque service affiche sa sélection ; « Ajouter » ouvre l'écran de
 *  recherche/sélection multiple (`EveningMenuPicker`), validé en un lot. */
export function EveningMenuScreen({
  items,
  explicit,
  partnerName,
  onToggle,
  onRefuse,
  onBack,
}: EveningMenuScreenProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Course>("starter");
  const [picking, setPicking] = useState(false);
  useBackClose(picking, () => setPicking(false));
  // Dernier retrait, annulable quelques secondes (toast « Annuler »).
  const [undo, setUndo] = useState<{ code: string; label: string } | null>(null);

  const byCourse: Record<Course, ApiEveningMenuItem[]> = {
    starter: items.filter((i) => i.course === "starter"),
    main: items.filter((i) => i.course === "main"),
    dessert: items.filter((i) => i.course === "dessert"),
  };
  const statuses = Object.fromEntries(
    COURSES.map((c) => [c, statusOf(byCourse[c])]),
  ) as Record<Course, CourseStatus>;

  // Diff entre ma sélection actuelle et celle validée : un toggle par écart
  // (le hook de domaine bascule par code, de façon optimiste).
  const applySelection = (codes: string[]) => {
    const next = new Set(codes);
    // Tout le catalogue : on peut avoir (dé)coché hors des catégories du service.
    for (const i of items) {
      if (i.picked !== next.has(i.code)) onToggle?.(i.code, active);
    }
    setPicking(false);
  };

  // Retirer mon choix : depuis le panneau, sans repasser par la sélection. Un
  // match touche l'autre personne → confirmation ; sinon un toast « Annuler ».
  const removeMine = (item: ApiEveningMenuItem, label: string) => {
    if (
      item.matched &&
      !confirmAction(
        t("eveningMenu.confirmRemoveMatch", {
          label,
          name: partnerName ?? t("eveningMenu.partner"),
        }),
      )
    ) {
      return;
    }
    onToggle?.(item.code);
    setUndo({ code: item.code, label });
  };

  if (picking) {
    return (
      <EveningMenuPicker
        items={items}
        course={active}
        explicit={explicit}
        partnerName={partnerName}
        onConfirm={applySelection}
        onCancel={() => setPicking(false)}
      />
    );
  }

  return (
    <div className="space-y-v3-5">
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
      </header>
      <CourseTabs active={active} statuses={statuses} onChange={setActive} />
      <EveningMenu
        items={byCourse[active]}
        explicit={explicit}
        partnerName={partnerName}
        onToggle={onToggle}
        onRemove={removeMine}
        onRefuse={onRefuse}
        onAdd={() => setPicking(true)}
      />
      {undo && (
        <UndoToast
          key={undo.code}
          message={t("eveningMenu.undoRemoved", { label: undo.label })}
          actionLabel={t("eveningMenu.undo")}
          onAction={() => {
            onToggle?.(undo.code);
            setUndo(null);
          }}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}
