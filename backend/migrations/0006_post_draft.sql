-- Brouillons de posts : un post en brouillon n'est visible que de son auteur et
-- ne déclenche aucune notification tant qu'il n'est pas publié (draft -> false).
ALTER TABLE posts ADD COLUMN draft BOOLEAN NOT NULL DEFAULT false;
