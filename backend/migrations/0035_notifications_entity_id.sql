-- Ajoute une référence vers l'entité concernée (post / commentaire / défi) à
-- `notifications` (0033), pour que le centre de notifications puisse naviguer
-- vers l'élément précis au clic, pas seulement ouvrir l'onglet. TEXT plutôt
-- qu'UUID : `desire`/`eveningMenu` sont identifiés par un "code" texte, pas un
-- UUID (cf. CLAUDE.md).
ALTER TABLE notifications ADD COLUMN entity_id TEXT;

-- Backfill de l'historique déjà inséré par 0034 (qui n'avait pas encore cette
-- colonne) — on ne retouche PAS 0034 : cette migration est déjà déployée en
-- prod/develop (sqlx vérifie un checksum par migration appliquée), donc toute
-- correction de l'historique passe forcément par une migration ultérieure.
-- Reconstruction par correspondance exacte (salon, acteur, horodatage), même
-- logique que 0034 pour produire ces lignes. `entity_id` reste NULL pour
-- mood/desire/eveningMenu/loveNote/memberJoined/downloadEnabled : pas de
-- navigation vers un item précis pour ces types (cf. CLAUDE.md), donc pas
-- besoin de reconstruire un lien pour l'historique de ces kind-là.

-- post → entity_id = id du post publié.
UPDATE notifications n
SET entity_id = p.id::text
FROM posts p
WHERE n.kind = 'post' AND n.entity_id IS NULL
  AND n.space_id = p.space_id AND n.actor_id = p.author_id
  AND n.created_at = p.created_at;

-- comment → entity_id = id du POST commenté (pas du commentaire), pour ouvrir
-- directement le fil de commentaires du bon post.
UPDATE notifications n
SET entity_id = c.post_id::text
FROM post_comments c
JOIN posts p ON p.id = c.post_id
WHERE n.kind = 'comment' AND n.entity_id IS NULL
  AND n.space_id = p.space_id AND n.actor_id = c.author_id
  AND n.created_at = c.created_at;

-- challenge → entity_id = id du défi proposé.
UPDATE notifications n
SET entity_id = ch.id::text
FROM challenges ch
WHERE n.kind = 'challenge' AND n.entity_id IS NULL
  AND n.space_id = ch.space_id AND n.actor_id = ch.proposer_id
  AND n.created_at = ch.created_at;
