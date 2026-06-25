import { useTranslation } from "react-i18next";
import type { ReleaseNote } from "../../releaseNotes";

export interface ReleaseNotesProps {
  /** Notes de version, du plus récent au plus ancien (#90). */
  notes: ReleaseNote[];
}

/**
 * Notes de version « quoi de neuf » (#90), présentationnel : une entrée par
 * version (étiquette + date localisée + points marquants). Le contenu est
 * bilingue dans la donnée ; on choisit la langue courante à l'affichage.
 */
export function ReleaseNotes({ notes }: ReleaseNotesProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const isFr = lang.startsWith("fr");
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));

  if (notes.length === 0) {
    return <p className="text-sm text-taupe-300">{t("releaseNotes.empty")}</p>;
  }

  return (
    <ol className="space-y-5">
      {notes.map((note, i) => (
        <li key={note.version} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-lg text-blush-100">
              {note.version}
              {i === 0 && (
                <span className="ml-2 align-middle rounded-full bg-spice-600 px-2 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-blush-50">
                  {t("releaseNotes.latest")}
                </span>
              )}
            </h3>
            <span className="shrink-0 text-xs text-taupe-300">
              {fmtDate(note.date)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {(isFr ? note.items.fr : note.items.en).map((item, j) => (
              <li
                key={j}
                className="flex gap-2 text-sm leading-snug text-taupe-200"
              >
                <span aria-hidden className="text-spice-300">
                  ·
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
