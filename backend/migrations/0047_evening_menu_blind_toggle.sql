-- Menu du soir : mode « ouvert » optionnel (au choix du salon), en plus du
-- mode aveugle strict existant (défaut, inchangé). En mode ouvert, dès qu'un
-- membre pose « want », l'autre le voit tout de suite et peut valider
-- (= poser son propre « want ») ou refuser — silence = inclus au menu ce
-- soir, refus explicite = exclu (badge visible).

-- Même nom/convention que spaces.blind_mood (précédent direct dans ce code).
ALTER TABLE spaces ADD COLUMN evening_menu_blind BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE evening_menu_picks
    ADD COLUMN stance TEXT NOT NULL DEFAULT 'want' CHECK (stance IN ('want', 'refused'));
