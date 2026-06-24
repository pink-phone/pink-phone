-- RR-04 — Suivre l'édition d'un commentaire (comme posts.updated_at / API-10) :
-- permet d'afficher « · modifié » côté front. Backfill = created_at.
ALTER TABLE post_comments
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE post_comments SET updated_at = created_at;
