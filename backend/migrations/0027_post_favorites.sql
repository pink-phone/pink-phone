-- Favoris de posts (#96) : marque-page PERSONNEL (par utilisateur), invisible des
-- autres membres. Un favori par (post, user), comme un verdict/réaction.
CREATE TABLE post_favorites (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_post_favorites_user ON post_favorites(user_id);
