-- Bascule la Bucket List et le Menu du soir sur le catalogue (#0033) : les
-- tables de suivi référençaient un `code TEXT` libre, validé côté Rust contre
-- une const figée. Elles référencent maintenant `catalog_items` par clé
-- étrangère — la validation devient « l'id existe et est actif » en base.
-- Pas de données à migrer (contenu de démo uniquement) : DROP + recréation.

DROP TABLE evening_menu_picks;
DROP TABLE desire_done;
DROP TABLE desire_interests;

CREATE TABLE desire_interests (
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    -- 'want' (envie, double-aveugle) ou 'against' (contre = limite, surfacée).
    stance     TEXT NOT NULL DEFAULT 'want' CHECK (stance IN ('want', 'against')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, code)
);

CREATE INDEX idx_desire_interests_space_code ON desire_interests(space_id, code);

-- Suivi « ✓ Réalisé », niveau SALON (couple), pas par membre.
CREATE TABLE desire_done (
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    code     TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    done_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (space_id, code)
);

-- Coche datée du jour local du salon ; plusieurs jours coexistent (purge
-- périodique) → le menu « se vide » chaque soir sans effacer l'historique récent.
CREATE TABLE evening_menu_picks (
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    day        DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, code, day)
);

CREATE INDEX idx_evening_menu_picks_space_day
    ON evening_menu_picks(space_id, day, code);
