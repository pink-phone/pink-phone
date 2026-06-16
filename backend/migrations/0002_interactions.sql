-- Interactions sous les posts : réactions emoji, verdict, commentaires.
-- Valeurs en TEXT alignées 1:1 sur les types du frontend.

-- Réactions rapides (🔥😏😮‍💨🤫) : une par (post, user, reaction).
CREATE TABLE post_reactions (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction   TEXT NOT NULL, -- 'fire' | 'smirk' | 'breath' | 'hush'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id, reaction)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);

-- Verdict "sans jugement" : un seul par (post, user).
CREATE TABLE post_verdicts (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verdict    TEXT NOT NULL, -- 'hot' | 'curious' | 'notForMe'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- Fil de commentaires sous un post.
CREATE TABLE post_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post_created ON post_comments(post_id, created_at);
