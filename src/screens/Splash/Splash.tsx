export interface SplashProps {
  message?: string;
}

/** Écran d'attente doux pendant le chargement initial. */
export function Splash({ message = "Un instant…" }: SplashProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="animate-fade-in text-4xl">🕯️</span>
      <h1 className="font-serif text-2xl text-blush-100">Pink Phone</h1>
      <p className="text-sm text-taupe-400">{message}</p>
    </main>
  );
}
