-- Catalogue de contenu partagé entre la Bucket List et le Menu du soir :
-- catégories + items, chacun classé « soft »/« hot ». Remplace les consts Rust
-- (`DESIRE_CATEGORIES`, `EVENING_MENU_CODES`) + les dictionnaires i18n figés par
-- une vraie base de données, pour pouvoir enrichir le contenu sans recompiler.

CREATE TABLE catalog_categories (
    id                   TEXT PRIMARY KEY,
    label_fr             TEXT NOT NULL,
    label_en             TEXT NOT NULL,
    -- Une catégorie peut alimenter l'une, l'autre, ou les deux fonctionnalités.
    used_in_bucket_list  BOOLEAN NOT NULL DEFAULT false,
    used_in_evening_menu BOOLEAN NOT NULL DEFAULT false,
    sort_order           INT NOT NULL DEFAULT 0
);

CREATE TABLE catalog_items (
    id              TEXT PRIMARY KEY,
    category_id     TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
    -- Regroupement libre à l'intérieur d'une catégorie (ex. 'kamasutra' dans
    -- 'positions'). NULL = aucune sous-catégorie. Pas de table dédiée : trop peu
    -- de cas pour justifier une vraie hiérarchie.
    subcategory     TEXT,
    label_fr        TEXT NOT NULL,
    label_en        TEXT NOT NULL,
    -- Variante suggestive (registre #99, toggle salon `desires_explicit_labels`)
    -- — seulement pour les items au libellé cru. NULL = pas de variante.
    label_fr_soft   TEXT,
    label_en_soft   TEXT,
    description_fr  TEXT,
    description_en  TEXT,
    intensity       TEXT NOT NULL CHECK (intensity IN ('soft', 'hot')),
    -- Retrait doux : un item désactivé disparaît des listings sans casser les
    -- picks/stances déjà posés dessus (la FK REFERENCES l'interdit en dur).
    active          BOOLEAN NOT NULL DEFAULT true,
    sort_order      INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_catalog_items_category ON catalog_items(category_id, sort_order);
