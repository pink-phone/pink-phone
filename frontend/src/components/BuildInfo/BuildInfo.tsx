import { useTranslation } from "react-i18next";
import {
  buildsDiffer,
  formatBuild,
  type BuildInfo as Build,
} from "../../lib/buildInfo";

/** État de la version côté serveur : chargée, en cours, ou injoignable. */
export type ApiBuildState = Build | "loading" | "unavailable";

export interface BuildInfoProps {
  /** Build de ce bundle web (figé à la compilation). */
  web: Build;
  /** Build de l'API (GET /api/version). */
  api: ApiBuildState;
}

/**
 * Version de l'application (bundle web) et du serveur (API), avec le commit
 * source — pour retrouver le code exact et repérer un front resté en cache face
 * à une API redéployée. Purement présentationnel : les données viennent d'en haut.
 */
export function BuildInfo({ web, api }: BuildInfoProps) {
  const { t } = useTranslation();
  const differ = typeof api === "object" && buildsDiffer(web, api);

  const apiText =
    api === "loading"
      ? t("settings.buildLoading")
      : api === "unavailable"
        ? t("settings.buildUnavailable")
        : formatBuild(api);

  return (
    <div className="px-1 text-[11px] text-taupe-300">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>{t("settings.buildApp")}</dt>
        <dd className="select-text text-right font-mono text-taupe-200">
          {formatBuild(web)}
        </dd>
        <dt>{t("settings.buildServer")}</dt>
        <dd className="select-text text-right font-mono text-taupe-200">
          {apiText}
        </dd>
      </dl>
      {differ && (
        <p role="status" className="mt-2 text-spice-300">
          {t("settings.buildMismatch")}
        </p>
      )}
    </div>
  );
}
