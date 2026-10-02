-- Menu du soir, mode aveugle : « J'ai fini ». Chaque membre valide son menu du
-- soir (jour local du salon). Quand TOUS les membres ont validé, les choix de
-- chacun sont dévoilés — matchés ou non (jusque-là, seuls les matchs l'étaient).
-- Une validation verrouille les choix de son auteur pour ce soir tant qu'elle
-- n'est pas retirée (retrait possible tant que tout le monde n'a pas fini).
CREATE TABLE evening_menu_done (
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day        DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, day)
);
