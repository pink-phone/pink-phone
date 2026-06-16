-- Schéma initial PinkPhone — multi-ready : tout contenu appartient à un Space.
-- Les statuts/intensités/moods sont stockés en TEXT avec les MÊMES chaînes que
-- les types du frontend (ex: 'challengeAccepted', 'veryHot'), pour un contrat 1:1.

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spaces (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lien User <-> Space (la brique du multi-partenaire). V1 : max 2 par space.
CREATE TABLE space_memberships (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'partner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, space_id)
);

CREATE INDEX idx_memberships_space ON space_memberships(space_id);
CREATE INDEX idx_memberships_user ON space_memberships(user_id);

-- Médias : stockés hors /public, servis via route authentifiée.
CREATE TABLE media (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,           -- nom de fichier UUID sur le disque
    mime       TEXT NOT NULL,
    view_once  BOOLEAN NOT NULL DEFAULT false,
    consumed   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_space ON media(space_id);

-- Humeur courante : une par (user, space), mise à jour par upsert.
CREATE TABLE moods (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, space_id)
);

CREATE TABLE posts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    body       TEXT NOT NULL,
    media_id   UUID REFERENCES media(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_space_created ON posts(space_id, created_at DESC);

CREATE TABLE challenges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id      UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    proposer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    intensity     TEXT NOT NULL,         -- 'soft' | 'hot' | 'hard'
    status        TEXT NOT NULL DEFAULT 'proposed', -- machine à états
    deadline_label TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenges_space_created ON challenges(space_id, created_at DESC);
