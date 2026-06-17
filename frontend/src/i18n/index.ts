import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { fr } from "./locales/fr";
import { en } from "./locales/en";

export const SUPPORTED_LANGS = ["fr", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGS,
    // FR/EN sans région : on ne garde que la base ("fr-FR" -> "fr").
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false }, // React échappe déjà.
    detection: {
      // Choix mémorisé par appareil ; sinon langue du navigateur.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "pp_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
