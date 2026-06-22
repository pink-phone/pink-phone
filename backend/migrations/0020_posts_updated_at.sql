-- API-10 : exposer la date de dernière modification d'un post (les posts sont
-- éditables — #46 — mais le front ne pouvait pas distinguer un post modifié).
ALTER TABLE posts ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill : pour les posts existants, « modifié le » = « créé le » (pas d'édition connue).
UPDATE posts SET updated_at = created_at;
