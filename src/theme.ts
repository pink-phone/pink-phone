// Thèmes (palette du DA "felted"). Les couleurs vivent en variables CSS
// (src/index.css) ; on bascule via l'attribut data-theme sur <html>.
export const THEMES = ["felted", "red-velvet"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "pp_theme";

/** Thème mémorisé (par appareil), sinon le défaut "felted". */
export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return THEMES.includes(stored as Theme) ? (stored as Theme) : "felted";
}

/** Applique le thème sur <html> et le persiste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}
