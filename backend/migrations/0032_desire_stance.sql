-- Bucket list (#99) v3 : l'intérêt devient un « stance » ternaire par membre —
-- 'want' (envie, double-aveugle) ou 'against' (contre = limite, surfacée). Le
-- neutre = absence de ligne. + un toggle salon pour le registre des libellés
-- (explicite vs suggestif).

ALTER TABLE desire_interests
    ADD COLUMN stance TEXT NOT NULL DEFAULT 'want'; -- 'want' | 'against'

-- Registre des libellés de la bucket list : explicite (défaut, assume le hot)
-- ou suggestif. Choix du salon (les deux voient le même registre).
ALTER TABLE spaces
    ADD COLUMN desires_explicit_labels BOOLEAN NOT NULL DEFAULT true;
