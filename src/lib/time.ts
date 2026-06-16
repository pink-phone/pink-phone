/** Libellé relatif court en français (ex: "il y a 10 min"). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "hier" : `il y a ${days} j`;
  return new Date(then).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
