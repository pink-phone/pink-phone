-- « Menu du soir » (#97b) : rituel QUOTIDIEN à double consentement. Chaque soir,
-- chacun coche en privé des envies « pour ce soir » dans un menu curaté ; un item
-- n'est révélé (« Match ! ») que si les deux l'ont coché LE MÊME JOUR (calendaire,
-- fuseau du salon, comme le mood). Optionnel par salon. Distinct du Dossier Noir
-- (#99, permanent) par son côté éphémère : les choix expirent au passage de minuit.

ALTER TABLE spaces
    ADD COLUMN evening_menu_enabled boolean NOT NULL DEFAULT false;

-- Coche d'un membre pour un item, datée du jour local du salon (`day`). Plusieurs
-- jours coexistent (purge périodique) → le menu « se vide » chaque soir sans
-- effacer l'historique récent.
CREATE TABLE evening_menu_picks (
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL, -- ∈ EVENING_MENU_CODES (validé côté serveur)
    day        DATE NOT NULL, -- jour calendaire local du salon au moment du coche
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, code, day)
);

CREATE INDEX idx_evening_menu_picks_space_day
    ON evening_menu_picks(space_id, day, code);
