import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Initialise i18next (les composants appellent `useTranslation`/`t`). On force le
// français pour des assertions déterministes (langue source du dictionnaire).
import i18n from "../i18n";

void i18n.changeLanguage("fr");

afterEach(() => {
  cleanup();
});
