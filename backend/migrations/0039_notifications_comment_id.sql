-- Pour `kind = 'comment'`, `entity_id` référence le POST commenté (pour
-- ouvrir le bon fil au clic) — mais le centre de notifications doit aussi
-- surligner le COMMENTAIRE précis dans ce fil, une info distincte qu'un seul
-- entity_id ne peut pas porter. `comment_id` la stocke, uniquement pour ce
-- kind ; `notify_members` la pose désormais directement à l'insertion (cf.
-- routes/interactions.rs).
ALTER TABLE notifications ADD COLUMN comment_id TEXT;

-- Relie l'historique déjà en base : pour chaque notification 'comment' dont
-- `entity_id` (le post) est déjà connu (0035/0036), retrouve le commentaire
-- de cet auteur sur ce post dont l'horodatage est le plus proche de celui de
-- la notification (même tolérance que 0036 : écart de quelques ms entre le
-- `now()` du commentaire et celui, distinct, de la notification).
UPDATE notifications n
SET comment_id = c.id::text
FROM post_comments c
WHERE n.kind = 'comment' AND n.comment_id IS NULL AND n.entity_id IS NOT NULL
  AND c.post_id::text = n.entity_id AND c.author_id = n.actor_id
  AND n.created_at BETWEEN c.created_at - INTERVAL '5 seconds'
                       AND c.created_at + INTERVAL '5 seconds'
  AND c.id = (
      SELECT c2.id FROM post_comments c2
      WHERE c2.post_id::text = n.entity_id AND c2.author_id = n.actor_id
      ORDER BY abs(extract(epoch FROM (n.created_at - c2.created_at)))
      LIMIT 1
  );
