-- #84/#85 — Notices de salon : petits événements affichés sur le dashboard au
-- retour dans l'app (un membre a rejoint, le téléchargement des médias a été
-- activé…). Le « vu » réutilise space_last_seen (feature 'notices').
CREATE TABLE space_notices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    -- 'member_joined' | 'download_enabled' (extensible).
    kind       TEXT NOT NULL,
    -- Auteur de l'action (null si système / utilisateur supprimé).
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_space_notices_space ON space_notices (space_id, created_at DESC);
