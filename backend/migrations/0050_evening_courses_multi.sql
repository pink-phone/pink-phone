-- Services du menu du soir paramétrables en SÉLECTION MULTIPLE : pour chaque
-- service (starter/main/dessert), la liste des catégories qui l'alimentent — une
-- catégorie peut nourrir plusieurs services. Remplace les surcharges
-- « catégorie → un service » de la migration 0048.
--
-- `evening_course_custom = false` (défaut) : classement du catalogue
-- (`catalog_items.evening_course`, par item). `true` : seules comptent les
-- entrées « <service>:<categorie> » de `evening_course_categories` (liste vide
-- = rien n'alimente aucun service, on pioche via « Tout le catalogue »).
ALTER TABLE spaces
    ADD COLUMN evening_course_custom BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN evening_course_categories TEXT[] NOT NULL DEFAULT '{}';

-- Reprise des surcharges 0048 : on matérialise le classement EFFECTIF de chaque
-- catégorie (surcharge si présente — `none` = aucun service —, sinon les services
-- de ses items par défaut) pour les salons qui en avaient.
UPDATE spaces s SET
    evening_course_custom = true,
    evening_course_categories = ARRAY(
        SELECT v.svc || ':' || c.id
        FROM catalog_categories c
        CROSS JOIN (VALUES ('starter'), ('main'), ('dessert')) AS v(svc)
        WHERE CASE
            WHEN EXISTS (SELECT 1 FROM unnest(s.evening_course_overrides) o
                         WHERE o LIKE c.id || ':%')
                THEN EXISTS (SELECT 1 FROM unnest(s.evening_course_overrides) o
                             WHERE o = c.id || ':' || v.svc)
            ELSE EXISTS (SELECT 1 FROM catalog_items i
                         WHERE i.category_id = c.id AND i.active
                           AND i.evening_course = v.svc)
        END
    )
WHERE cardinality(s.evening_course_overrides) > 0;

ALTER TABLE spaces DROP COLUMN evening_course_overrides;
