import i18n from "../i18n";

/** Libellé relatif court, localisé selon la langue courante (ex: "il y a 10 min" / "10 min ago"). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const lang = i18n.resolvedLanguage ?? i18n.language ?? "fr";
  const rtf = new Intl.RelativeTimeFormat(lang, {
    numeric: "auto",
    style: "short",
  });

  // Différence signée (négative = passé) pour que RelativeTimeFormat dise
  // "il y a …" / "… ago" et gère "hier"/"yesterday", "maintenant"/"now".
  const diffSec = Math.round((then - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 45) return rtf.format(0, "second");

  const min = Math.round(diffSec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");

  const hours = Math.round(min / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");

  return new Date(then).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
  });
}
