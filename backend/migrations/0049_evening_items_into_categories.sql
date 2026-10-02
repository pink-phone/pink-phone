-- La catégorie transverse « Menu du soir » (`evening`, 10 items répartis sur les
-- 3 services) n'a pas de sens pour qui règle les services par catégorie. Ses
-- items rejoignent les catégories du catalogue. `evening_course` est porté par
-- l'ITEM : changer de catégorie ne change donc le service d'aucun item.
--
-- Trois items sont des doublons exacts d'items déjà au catalogue (la bucket list
-- les verrait en double une fois rangés dans la même catégorie) : ils sont
-- désactivés (retrait doux — la FK interdit la suppression) et leur jumeau prend
-- le service d'origine.
--   evening-bath      ≡ bathTogether  (tender,  service entrée — déjà le défaut)
--   evening-slowDance ≡ slowDance     (tender,  service entrée — déjà le défaut)
--   evening-roleplay  ≡ roleplay      (games,   service plat   — posé ci-dessous)
UPDATE catalog_items SET evening_course = 'main' WHERE id = 'roleplay';

UPDATE catalog_items SET active = false
    WHERE id IN ('evening-bath', 'evening-slowDance', 'evening-roleplay');

-- Les items restants vont dans leur catégorie naturelle (sort_order après les
-- items existants). Les doublons désactivés suivent leur jumeau (la FK
-- catégorie → RESTRICT impose un rattachement avant de supprimer `evening`).
UPDATE catalog_items SET category_id = 'tender', sort_order = 101 WHERE id = 'evening-cuddle';
UPDATE catalog_items SET category_id = 'tender', sort_order = 102 WHERE id = 'evening-movie';
UPDATE catalog_items SET category_id = 'tender', sort_order = 103 WHERE id = 'evening-candlelight';
UPDATE catalog_items SET category_id = 'tender', sort_order = 104 WHERE id = 'evening-massage';
UPDATE catalog_items SET category_id = 'tender', sort_order = 105 WHERE id = 'evening-bath';
UPDATE catalog_items SET category_id = 'tender', sort_order = 106 WHERE id = 'evening-slowDance';
UPDATE catalog_items SET category_id = 'games',  sort_order = 101 WHERE id = 'evening-game';
UPDATE catalog_items SET category_id = 'games',  sort_order = 102 WHERE id = 'evening-roleplay';
UPDATE catalog_items SET category_id = 'practices', sort_order = 101 WHERE id = 'evening-newThing';
UPDATE catalog_items SET category_id = 'practices', sort_order = 102 WHERE id = 'evening-passionate';

DELETE FROM catalog_categories WHERE id = 'evening';

-- Une éventuelle surcharge de salon sur l'ancienne catégorie n'a plus d'objet.
UPDATE spaces SET evening_course_overrides =
    array_remove(
        ARRAY(SELECT o FROM unnest(evening_course_overrides) o WHERE o NOT LIKE 'evening:%'),
        NULL
    );
