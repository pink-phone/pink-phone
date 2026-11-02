-- Centre de notifications : historique consultable et marquable "lu", par
-- destinataire (contrairement à `space_notices`, qui est un fil d'annonces
-- système partagé avec un "vu" grossier par feature). Une ligne par
-- destinataire, créée aux mêmes points que le Web Push (`notify_members`).
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    -- Destinataire (pas l'auteur de l'action).
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'post' | 'comment' | 'challenge' | 'mood' | 'desire' | 'eveningMenu' |
    -- 'loveNote' | 'memberJoined' (extensible, cf. EventKind).
    kind       TEXT NOT NULL,
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
-- Partiel : n'indexe que les lignes non lues, seul cas interrogé pour le badge.
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
