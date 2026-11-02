-- Connecte le Menu du soir (#97b) à toute la banque du catalogue (#0033) au
-- lieu de sa propre petite liste isolée : chaque item éligible porte
-- désormais son service (« entrée » / « plat » / « dessert »). Remplace
-- `catalog_categories.used_in_evening_menu` (flag au niveau catégorie) —
-- devenu redondant, source de vérité unique = ce champ item-level.

ALTER TABLE catalog_items ADD COLUMN evening_course TEXT
    CHECK (evening_course IN ('starter', 'main', 'dessert'));

ALTER TABLE catalog_categories DROP COLUMN used_in_evening_menu;

-- Entrée : tendre & complice, jeux — l'échauffement.
UPDATE catalog_items SET evening_course = 'starter' WHERE category_id IN ('tender', 'games');

-- Plat : positions (Kamasutra + modernes), sensations, pouvoir — le cœur de
-- la soirée. Le prompt rotatif « nouvelle position à tester » reste hors
-- menu du soir (ce n'est pas un choix pour CE soir).
UPDATE catalog_items SET evening_course = 'main'
    WHERE category_id IN ('positions', 'sensations', 'power') AND id <> 'positions-new-monthly';

-- Dessert : les pratiques, pour finir.
UPDATE catalog_items SET evening_course = 'dessert' WHERE category_id = 'practices';

-- Les 10 items déjà propres au menu du soir, répartis individuellement (ils
-- n'ont pas de catégorie catalogue commune à mapper en bloc).
UPDATE catalog_items SET evening_course = 'starter'
    WHERE id IN ('evening-cuddle', 'evening-movie', 'evening-candlelight',
                 'evening-bath', 'evening-massage', 'evening-slowDance');
UPDATE catalog_items SET evening_course = 'main'
    WHERE id IN ('evening-game', 'evening-roleplay');
UPDATE catalog_items SET evening_course = 'dessert'
    WHERE id IN ('evening-newThing', 'evening-passionate');

-- `places` et le prompt rotatif restent evening_course NULL : bucket-list
-- uniquement, jamais proposés dans le menu du soir.
