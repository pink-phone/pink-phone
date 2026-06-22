-- #69 : relier un défi à la suggestion de la banque dont il est issu (quand on
-- « Propose » depuis la banque) → permet d'afficher un ✓ « déjà fait » sur les
-- items de la banque qui ont été réalisés (un défi issu de cette suggestion est
-- passé à jobDone).
ALTER TABLE challenges
    ADD COLUMN source_suggestion_id UUID
        REFERENCES challenge_suggestions(id) ON DELETE SET NULL;

-- #70 : masquer une suggestion PAR SALON. Le seed global (space_id NULL) n'est
-- pas supprimable par un salon ; le masquer le retire des inspirations du
-- composer (et le grise dans la banque, avec une action « Réafficher »).
CREATE TABLE hidden_suggestions (
    space_id      UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    suggestion_id UUID NOT NULL REFERENCES challenge_suggestions(id) ON DELETE CASCADE,
    hidden_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, suggestion_id)
);
