-- Bascule la Bucket List et le Menu du soir sur le catalogue (#0033) : les
-- tables de suivi référençaient un `code TEXT` libre, validé côté Rust contre
-- une const figée. Elles référencent maintenant `catalog_items` par clé
-- étrangère — la validation devient « l'id existe et est actif » en base.
--
-- Les choix du menu du soir sont quotidiens (purgés après 2 jours) et ses anciens
-- codes n'existent plus : on les jette. En revanche les envies (bucket list) et
-- leur « réalisé » sont DURABLES : les anciennes tables sont mises de côté ici et
-- leurs lignes reprises par la migration 0051, une fois le catalogue semé.

DROP TABLE evening_menu_picks;

ALTER TABLE desire_interests RENAME TO desire_interests_old;
ALTER INDEX desire_interests_pkey RENAME TO desire_interests_old_pkey;
ALTER INDEX idx_desire_interests_space_code RENAME TO idx_desire_interests_old_space_code;
ALTER TABLE desire_done RENAME TO desire_done_old;
ALTER INDEX desire_done_pkey RENAME TO desire_done_old_pkey;

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
