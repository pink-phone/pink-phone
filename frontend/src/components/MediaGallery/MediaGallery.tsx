import { useState } from "react";
import { SafeMedia } from "../SafeMedia/SafeMedia";
import type { BlogPostMedia } from "../BlogPost/BlogPost";
import { cn } from "../../lib/cn";

export interface MediaGalleryProps {
  /** Médias du post, dans l'ordre (#87). */
  media: BlogPostMedia[];
  className?: string;
}

function Item({ m }: { m: BlogPostMedia }) {
  return (
    <SafeMedia
      src={m.src}
      loader={m.loader}
      kind={m.kind}
      alt={m.alt}
      viewOnce={m.viewOnce}
      consumed={m.consumed}
      downloadable={m.downloadable}
    />
  );
}

/**
 * Galerie de médias d'un post (#87) : un seul média → plein cadre ; plusieurs →
 * **carrousel** à défilement horizontal (snap) avec des points indicateurs.
 * Chaque média garde le geste press-and-hold (SafeMedia) et le mute (#88).
 */
export function MediaGallery({ media, className }: MediaGalleryProps) {
  const [index, setIndex] = useState(0);

  if (media.length === 0) return null;
  if (media.length === 1) {
    return (
      <div className={className}>
        <Item m={media[0]} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {media.map((m, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            <Item m={m} />
          </div>
        ))}
      </div>
      {/* Points indicateurs (média courant) */}
      <div
        className="flex items-center justify-center gap-1.5"
        aria-hidden
      >
        {media.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300 ease-felt",
              i === index ? "w-4 bg-spice-400" : "w-1.5 bg-charcoal-600",
            )}
          />
        ))}
      </div>
    </div>
  );
}
