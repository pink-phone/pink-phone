-- #87 — Plusieurs médias par post (galerie ordonnée). Remplace le `posts.media_id`
-- unique par une table de liaison ordonnée. Les flags éphémère/téléchargeable
-- restent au niveau du POST (décision produit) : view_once vit sur `media`,
-- allow_download sur `posts` — inchangés.
CREATE TABLE post_media (
    post_id  UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, media_id)
);
CREATE INDEX idx_post_media_post ON post_media (post_id, position);

-- Backfill : le média déjà attaché (single) devient le 1er média de la galerie.
INSERT INTO post_media (post_id, media_id, position)
SELECT id, media_id, 0 FROM posts WHERE media_id IS NOT NULL;

-- `posts.media_id` n'est plus la source de vérité (on lit `post_media`). On le
-- garde nullable pour ne rien casser, mais les nouveaux posts ne l'écrivent plus.
