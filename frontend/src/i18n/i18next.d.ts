import "i18next";
import type { Resources } from "./locales/fr";

// Active la vérification des clés `t()` par TypeScript (clé inconnue = erreur).
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Resources };
  }
}
