-- Préférences de notification « à la carte » + abonnements Web Push.

-- Mode par utilisateur : 'push' (push immédiat), 'digest' (mail quotidien),
-- 'ghost' (rien, on découvre en ouvrant l'app).
CREATE TABLE user_settings (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notif_mode TEXT NOT NULL DEFAULT 'push',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Abonnements Web Push (un appareil = un endpoint).
CREATE TABLE push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
