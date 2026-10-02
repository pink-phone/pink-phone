-- Reprise des envies (bucket list) existantes dans les tables liées au catalogue
-- (migration 0041 les avait mises de côté sous le suffixe _old).
--
-- Les anciens codes sont ceux des consts Rust d'origine ; le catalogue les a repris
-- tels quels, SAUF les 11 positions d'origine, désormais portées par les positions
-- Kamasutra (id préfixés) — d'où la table de correspondance. Une ligne dont le code
-- n'existe pas au catalogue est ignorée (la clé étrangère l'interdit).
CREATE TEMP TABLE desire_code_map (old_code TEXT PRIMARY KEY, new_code TEXT NOT NULL);
INSERT INTO desire_code_map (old_code, new_code) VALUES
    ('cowgirl',            'kamasutra-cowgirl'),
    ('doggy',              'kamasutra-doggy-style'),
    ('edgeOfBed',          'kamasutra-edge-of-bed'),
    ('lotus',              'kamasutra-lotus'),
    ('mirror',             'kamasutra-mirror'),
    ('missionary',         'kamasutra-missionary'),
    ('reverseCowgirl',     'kamasutra-reverse-cowgirl'),
    ('spooning',           'kamasutra-spooning'),
    ('standing',           'kamasutra-standing'),
    ('wheelbarrow',        'kamasutra-wheelbarrow'),
    ('newPositionMonthly', 'positions-new-monthly');

INSERT INTO desire_interests (space_id, user_id, code, stance, created_at)
SELECT o.space_id, o.user_id, COALESCE(m.new_code, o.code), o.stance, o.created_at
FROM desire_interests_old o
LEFT JOIN desire_code_map m ON m.old_code = o.code
WHERE EXISTS (SELECT 1 FROM catalog_items c WHERE c.id = COALESCE(m.new_code, o.code))
ON CONFLICT DO NOTHING;

INSERT INTO desire_done (space_id, code, done_at, done_by)
SELECT o.space_id, COALESCE(m.new_code, o.code), o.done_at, o.done_by
FROM desire_done_old o
LEFT JOIN desire_code_map m ON m.old_code = o.code
WHERE EXISTS (SELECT 1 FROM catalog_items c WHERE c.id = COALESCE(m.new_code, o.code))
ON CONFLICT DO NOTHING;

DROP TABLE desire_interests_old;
DROP TABLE desire_done_old;
DROP TABLE desire_code_map;
