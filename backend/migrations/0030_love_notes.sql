-- Boîte à « mots doux » (#102) : petits post-it laissés sur l'accueil, avec une
-- ouverture différée optionnelle (« à n'ouvrir qu'à [date/heure] »). Le scellage
-- est appliqué CÔTÉ SERVEUR (le corps n'est pas renvoyé au/à la destinataire tant
-- que `open_at` n'est pas passé), sinon contournable côté client.

CREATE TABLE love_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    -- NULL = mot immédiat ; sinon le corps reste scellé pour les autres jusque-là.
    open_at    TIMESTAMPTZ,
    -- Push de déverrouillage déjà envoyé ? (anti-doublon de la tâche planifiée).
    notified   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_love_notes_space_created ON love_notes(space_id, created_at DESC);
-- Pour la tâche horaire qui livre les mots différés arrivés à échéance.
CREATE INDEX idx_love_notes_due ON love_notes(open_at) WHERE notified = false;
