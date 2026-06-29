-- « Dossier Noir » / liste d'envies à double consentement (#99), OPTIONNEL par
-- salon. Catalogue d'envies = liste curatée de CODES stables (const Rust
-- `DESIRE_CODES`, libellés rendus côté front via i18n) → matching insensible à la
-- langue. Chacun coche en privé ; un code n'est « matché » (révélé) que si MOI ET
-- au moins un autre membre l'avons coché (double-aveugle préservé).

-- Activation de la fonctionnalité au niveau du salon. Désactivé par défaut.
ALTER TABLE spaces
    ADD COLUMN desires_enabled boolean NOT NULL DEFAULT false;

-- Intérêt privé d'un membre pour une envie du catalogue (par code).
CREATE TABLE desire_interests (
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL, -- ∈ DESIRE_CODES (validé côté serveur)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, code)
);

CREATE INDEX idx_desire_interests_space_code ON desire_interests(space_id, code);
