import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export interface SafeMediaProps {
  /** Source directe (mock/preview). Ignorée si `loader` est fourni. */
  src?: string;
  /**
   * Chargement paresseux du média authentifié : appelé à la première révélation,
   * renvoie une object URL. Le résultat est mis en cache puis révoqué au démontage.
   */
  loader?: () => Promise<string>;
  /**
   * Nature du média. La vidéo se lit pendant qu'on maintient (révélation), puis
   * se met en pause au relâchement — le geste « press-and-hold » de la DA reste
   * identique aux photos. Défaut : image.
   */
  kind?: "image" | "video";
  alt: string;
  /**
   * "View once" : une fois révélé, le média se consume et ne peut plus être
   * rouvert côté client (le backend supprime le fichier de son côté).
   */
  viewOnce?: boolean;
  /**
   * Média éphémère déjà consommé côté serveur (persiste l'état "Envolé…" après
   * un rechargement, sans tenter de charger un fichier qui n'existe plus).
   */
  consumed?: boolean;
  /**
   * Média téléchargeable (#78) : affiche un bouton de téléchargement. Sans effet
   * sur un média éphémère (l'appelant ne doit pas l'activer pour un `viewOnce`).
   */
  downloadable?: boolean;
  /** Nom de fichier proposé au téléchargement. */
  downloadName?: string;
  /** Appelé la première fois que le média est révélé. */
  onReveal?: () => void;
  className?: string;
}

/**
 * Média flouté par défaut (filter: blur) — anti-regards indiscrets.
 * On maintient le clic / le doigt dessus pour révéler : la sécurité
 * devient un geste sensuel plutôt qu'une barrière froide (DA "felted").
 */
export function SafeMedia({
  src,
  loader,
  kind = "image",
  alt,
  viewOnce = false,
  consumed = false,
  downloadable = false,
  downloadName = "pink-phone",
  onReveal,
  className,
}: SafeMediaProps) {
  const { t } = useTranslation();
  const [isRevealed, setIsRevealed] = useState(false);
  const [isConsumed, setIsConsumed] = useState(consumed);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(
    loader ? null : (src ?? null),
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasRevealedOnce = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Démontage : pour révoquer une object URL qui résoudrait APRÈS (REACT2-04).
  const mounted = useRef(true);
  // Garde anti-concurrence du téléchargement (REACT2-03).
  const downloading = useRef(false);

  // Révoque l'object URL chargé paresseusement au démontage.
  useEffect(
    () => () => {
      mounted.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  // Vidéo : lecture pendant la révélation, pause sinon (le geste pilote la lecture).
  useEffect(() => {
    if (kind !== "video") return;
    const v = videoRef.current;
    if (!v) return;
    if (isRevealed && resolvedSrc) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [kind, isRevealed, resolvedSrc]);

  const reveal = useCallback(() => {
    if (isConsumed) return;
    setIsRevealed(true);

    // Un échec précédent ne doit pas être définitif : chaque nouvelle révélation
    // retente le chargement (un blip réseau sur un média lourd ne « gèle » plus
    // l'état « indisponible » jusqu'au rechargement de la page).
    if (loader && resolvedSrc === null && !loading) {
      setFailed(false);
      setLoading(true);
      loader()
        .then((url) => {
          objectUrl.current = url;
          setResolvedSrc(url);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }

    if (!hasRevealedOnce.current) {
      hasRevealedOnce.current = true;
      onReveal?.();
    }
    // `failed` n'est pas lu ici (la garde `!loading` suffit) → hors deps (REACT-07).
  }, [isConsumed, loader, resolvedSrc, loading, onReveal]);

  const hide = useCallback(() => {
    setIsRevealed(false);
    if (viewOnce && hasRevealedOnce.current) {
      setIsConsumed(true);
    }
  }, [viewOnce]);

  // Téléchargement (#78) : on s'assure d'avoir l'object URL (réutilisé du
  // press-and-hold, ou chargé à la demande), puis on déclenche `<a download>`.
  // stopPropagation pour ne pas armer le geste de révélation.
  const download = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Anti-concurrence (REACT2-03) : pas de 2e loader() en parallèle (double-clic
      // ou reveal en vol) qui écraserait l'object URL sans le révoquer.
      if (downloading.current) return;
      // Réutilise l'URL déjà chargée (état ou ref) avant de rappeler loader().
      let url = resolvedSrc ?? objectUrl.current;
      if (!url && loader) {
        downloading.current = true;
        try {
          url = await loader();
          // Démonté pendant le chargement (REACT2-04) : révoquer ici, sinon le
          // cleanup (déjà passé) ne révoquera jamais cette URL.
          if (!mounted.current) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrl.current = url;
          setResolvedSrc(url);
        } catch {
          if (mounted.current) setFailed(true);
          return;
        } finally {
          downloading.current = false;
        }
      }
      if (!url) return;
      // NB iOS PWA : le download d'un blob object-URL est capricieux (peut ouvrir
      // au lieu d'enregistrer) — caveat connu (cf. backlog #78).
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [resolvedSrc, loader, downloadName],
  );

  return (
    <div
      role="button"
      tabIndex={isConsumed ? -1 : 0}
      aria-label={
        isConsumed
          ? t("safeMedia.consumedAria")
          : t("safeMedia.revealAria", { alt })
      }
      aria-pressed={isRevealed}
      className={cn(
        "relative mx-auto aspect-[4/5] w-full max-w-sm select-none overflow-hidden rounded-3xl shadow-felt outline-none",
        // iOS : neutralise le menu contextuel natif (Copier/Enregistrer) du press-and-hold.
        "[-webkit-touch-callout:none] [-webkit-user-select:none]",
        "ring-1 ring-charcoal-600/60 focus-visible:ring-2 focus-visible:ring-spice-500",
        !isConsumed && "cursor-pointer",
        className,
      )}
      onPointerDown={reveal}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          reveal();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") hide();
      }}
    >
      {!isConsumed &&
        resolvedSrc &&
        (kind === "video" ? (
          <video
            ref={videoRef}
            src={resolvedSrc}
            aria-label={alt}
            playsInline
            loop
            draggable={false}
            className={cn(
              "h-full w-full object-cover transition-all duration-500 ease-felt",
              "pointer-events-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
              isRevealed ? "scale-100 blur-0" : "scale-110 blur-2xl",
            )}
          />
        ) : (
          <img
            src={resolvedSrc}
            alt={alt}
            draggable={false}
            className={cn(
              "h-full w-full object-cover transition-all duration-500 ease-felt",
              "pointer-events-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
              isRevealed ? "scale-100 blur-0" : "scale-110 blur-2xl",
            )}
          />
        ))}

      {/* Voile + invite tant que ce n'est pas révélé */}
      {!isRevealed && !isConsumed && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-charcoal-900/40 p-4 text-center text-blush-100 backdrop-blur-[2px]">
          {/* Léger battement : signale que le média se « révèle » (geste à
              découvrir). Respecte prefers-reduced-motion (UI-UX6). */}
          <span className="animate-[pulse_2.4s_ease-in-out_infinite] text-3xl motion-reduce:animate-none">
            {kind === "video" ? "🎬" : "🤫"}
          </span>
          <p className="font-serif text-base">{t("safeMedia.secret")}</p>
          <p className="text-xs text-taupe-200/80">
            {t(kind === "video" ? "safeMedia.holdToWatch" : "safeMedia.holdToReveal")}
          </p>
          {viewOnce && (
            <span className="mt-2 rounded-full bg-bordeaux-600/80 px-3 py-0.5 text-[11px] tracking-wide text-blush-100">
              {t("safeMedia.ephemeralBadge")}
            </span>
          )}
        </div>
      )}

      {/* Chargement du média authentifié */}
      {isRevealed && loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-charcoal-900/50 text-sm text-taupe-200">
          {t("safeMedia.loading")}
        </div>
      )}

      {/* Échec de chargement */}
      {isRevealed && failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-charcoal-900/60 p-4 text-center text-sm text-blush-200">
          {t("safeMedia.unavailable")}
        </div>
      )}

      {/* Bouton de téléchargement (#78) — jamais sur un média éphémère/consommé.
          stopPropagation au pointerdown pour ne pas armer la révélation. */}
      {downloadable && !isConsumed && (
        <button
          type="button"
          onClick={download}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t("safeMedia.download")}
          className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-charcoal-900/70 text-lg text-blush-100 shadow-felt-sm backdrop-blur-sm transition-colors duration-200 ease-felt hover:bg-charcoal-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spice-500"
        >
          ⤓
        </button>
      )}

      {/* Média éphémère consommé */}
      {isConsumed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-charcoal-800 bg-felt-velvet p-4 text-center text-taupe-300">
          <span className="text-3xl opacity-70">🌫️</span>
          <p className="font-serif text-base text-taupe-200">{t("safeMedia.goneTitle")}</p>
          <p className="text-xs">{t("safeMedia.goneText")}</p>
        </div>
      )}
    </div>
  );
}
