-- Menu du soir : services (Entrée/Plat/Dessert) paramétrables par salon, et
-- choix possible d'items HORS des catégories d'un service.
--
-- Surcharges par salon du classement catégorie → service. Chaque entrée est
-- « <categorie>:<service> » avec service ∈ starter|main|dessert|none (`none` =
-- la catégorie ne remplit aucun service). Absence de surcharge = défaut du
-- catalogue (`catalog_items.evening_course`, migration 0046). Validé côté API.
ALTER TABLE spaces ADD COLUMN evening_course_overrides TEXT[] NOT NULL DEFAULT '{}';

-- Service dans lequel un choix a été ajouté (le catalogue n'impose plus le
-- service : on peut piocher hors catégorie). NULL = service par défaut de l'item.
ALTER TABLE evening_menu_picks
    ADD COLUMN course TEXT CHECK (course IN ('starter', 'main', 'dessert'));
