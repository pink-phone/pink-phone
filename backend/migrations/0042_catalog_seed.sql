-- Seed du catalogue (#0033) : les catégories existantes + tous leurs items,
-- portés tels quels depuis les anciennes consts Rust (`DESIRE_CATEGORIES`,
-- `EVENING_MENU_CODES`) et les dictionnaires i18n (mêmes libellés FR/EN, mêmes
-- variantes suggestives pour « practices »). La catégorie « positions » est
-- créée ici mais ses items viennent de #0036 (64 positions du Kamasutra).

INSERT INTO catalog_categories (id, label_fr, label_en, used_in_bucket_list, used_in_evening_menu, sort_order) VALUES
    ('tender',     'Tendre & complice',  'Tender & close',     true,  false, 1),
    ('games',      'Jeux & scénarios',   'Games & scenarios',  true,  false, 2),
    ('positions',  'Positions',          'Positions',          true,  false, 3),
    ('sensations', 'Sensations',         'Sensations',         true,  false, 4),
    ('power',      'Pouvoir & rôles',    'Power & roles',      true,  false, 5),
    ('places',     'Lieux & frissons',   'Places & thrills',   true,  false, 6),
    ('practices',  'Pratiques (hot)',    'Practices (hot)',    true,  false, 7),
    ('evening',    'Menu du soir',       'Tonight''s menu',    false, true,  8);

-- tender
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('morningCuddle', 'tender', 'Un réveil câlin',              'A cuddly wake-up',              'soft', 1),
    ('oilMassage',    'tender', 'Un massage aux huiles',        'An oil massage',                'soft', 2),
    ('bathTogether',  'tender', 'Un bain à deux',                'A bath together',               'soft', 3),
    ('slowDance',     'tender', 'Un slow improvisé',             'An impromptu slow dance',       'soft', 4),
    ('lingerie',      'tender', 'Lingerie ou tenue surprise',    'Surprise lingerie or outfit',   'soft', 5),
    ('rediscover',    'tender', 'Se redécouvrir tout en lenteur','Rediscover each other slowly',  'soft', 6);

-- games
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('roleplay',      'games', 'Un jeu de rôle',                        'A role play',                  'soft', 1),
    ('truthOrDare',   'games', 'Action ou vérité coquin',               'Naughty truth or dare',        'soft', 2),
    ('striptease',    'games', 'Un strip-tease',                        'A striptease',                 'hot',  3),
    ('photoSession',  'games', 'Une séance photo complice',             'A playful photo session',      'hot',  4),
    ('writeFantasy',  'games', 'Écrire un fantasme à deux',             'Write a fantasy together',     'soft', 5),
    ('daySexting',    'games', 'Se chauffer par message dans la journée','Tease by text during the day','soft', 6);

-- sensations
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('blindfold',     'sensations', 'À l''aveugle (bandeau)',                  'Blindfolded',                    'soft', 1),
    ('lightBondage',  'sensations', 'Liens légers',                            'Light bondage',                  'hot',  2),
    ('spanking',      'sensations', 'Une fessée',                              'A spanking',                     'hot',  3),
    ('temperature',   'sensations', 'Jeux de température (glace, bougie douce)','Temperature play (ice, soft wax)','soft', 4),
    ('edging',        'sensations', 'Tout en lenteur, repousser l''envie',     'Slow teasing, holding back',     'hot',  5),
    ('toy',           'sensations', 'Un accessoire, un jouet',                 'A toy, an accessory',           'soft', 6);

-- power
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('gentleDomination', 'power', 'Domination douce',              'Gentle domination',       'hot',  1),
    ('submission',       'power', 'Se laisser dominer',            'Letting go, submitting',  'hot',  2),
    ('commands',         'power', 'Donner ou suivre des consignes','Give or follow commands', 'hot',  3),
    ('softCollar',       'power', 'Un collier, en douceur',        'A soft collar',           'soft', 4),
    ('eveningRules',     'power', 'Une soirée avec des règles',    'An evening with rules',   'hot',  5);

-- places
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('outdoors',    'places', 'En plein air',                        'Outdoors',                          'hot',  1),
    ('car',         'places', 'En voiture',                          'In the car',                        'hot',  2),
    ('hotel',       'places', 'Un hôtel, un week-end',               'A hotel, a getaway',                'soft', 3),
    ('anotherRoom', 'places', 'Une autre pièce que la chambre',      'A room other than the bedroom',     'soft', 4),
    ('semiPublic',  'places', 'Le frisson d''un lieu semi-public',   'The thrill of a semi-public place', 'hot',  5),
    ('voyeur',      'places', 'Se montrer, se filmer',               'Show off, film yourselves',         'hot',  6);

-- practices — registre cru par défaut + variante suggestive (toggle salon).
INSERT INTO catalog_items (id, category_id, label_fr, label_en, label_fr_soft, label_en_soft, intensity, sort_order) VALUES
    ('fellatio',            'practices', 'Fellation',              'Fellatio / blowjob',   'Une gâterie',                 'A little oral treat',       'hot', 1),
    ('cunnilingus',         'practices', 'Cunnilingus',            'Cunnilingus',          'Un plaisir tout en langue',   'Oral pleasure for her',     'hot', 2),
    ('sixtyNine',           'practices', 'Soixante-neuf',          'Sixty-nine',           'Se faire plaisir à deux',     'Pleasure each other at once','hot', 3),
    ('mutualMasturbation',  'practices', 'Masturbation mutuelle',  'Mutual masturbation',  'Se caresser mutuellement',    'Touch each other',          'hot', 4),
    ('fingering',           'practices', 'Doigté',                 'Fingering',            'Des caresses intimes',        'Intimate caresses',         'hot', 5),
    ('rimming',              'practices', 'Anulingus',             'Rimming',              'Un baiser très intime',       'A very intimate kiss',      'hot', 6),
    ('anal',                'practices', 'Sodomie',                'Anal sex',             'L''amour par-derrière',       'Love from behind',          'hot', 7),
    ('facial',               'practices', 'Éjaculation faciale',   'Facial',               'Finir sur elle',              'Finish on her',             'hot', 8),
    ('swallow',              'practices', 'Avaler',                'Swallowing',           'Aller jusqu''au bout',        'Go all the way',            'hot', 9),
    ('squirting',            'practices', 'Squirting',             'Squirting',            'L''emmener très loin',        'Take her over the edge',    'hot', 10);

-- Menu du soir — rituel quotidien, du plus tendre au plus épicé. Ids préfixés
-- `evening-` : `id` est une clé globale au catalogue, certains libellés
-- recoupent volontairement ceux de la bucket list (ex. « slowDance ») sans
-- pouvoir partager le même id.
INSERT INTO catalog_items (id, category_id, label_fr, label_en, intensity, sort_order) VALUES
    ('evening-cuddle',      'evening', 'Câlins sous la couette',   'Cuddles under the covers', 'soft', 1),
    ('evening-movie',       'evening', 'Un film, blotti·e·s',      'A movie, snuggled up',     'soft', 2),
    ('evening-candlelight', 'evening', 'Dîner aux chandelles',     'Candlelit dinner',         'soft', 3),
    ('evening-bath',        'evening', 'Un bain à deux',           'A bath together',          'soft', 4),
    ('evening-massage',     'evening', 'Un massage',               'A massage',                'soft', 5),
    ('evening-slowDance',   'evening', 'Un slow tous les deux',    'A slow dance, just us',    'soft', 6),
    ('evening-game',        'evening', 'Un jeu un peu coquin',     'A playful game',           'hot',  7),
    ('evening-roleplay',    'evening', 'Un jeu de rôle',           'A role play',              'hot',  8),
    ('evening-newThing',    'evening', 'Tenter une nouveauté',     'Try something new',        'hot',  9),
    ('evening-passionate',  'evening', 'Une nuit passionnée',      'A passionate night',       'hot',  10);
