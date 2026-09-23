-- 0035 relie `entity_id` par égalité STRICTE de `created_at`. Ça marche pour
-- l'historique backfillé par 0034 (le timestamp y est copié tel quel depuis
-- la source), mais PAS pour les notifications créées en direct entre le
-- déploiement de la table `notifications` (0033/0034) et celui d'`entity_id`
-- (0035) : `notify_members` insérait alors la notification avec son PROPRE
-- `now()`, quelques millisecondes après le `now()` du post/commentaire/défi
-- source (deux `INSERT` distincts, même requête HTTP) — l'égalité stricte
-- rate ces lignes-là (confirmé en prod : écarts de 3 à 8 ms observés).
--
-- Relie ce qui reste NULL par correspondance temporelle la PLUS PROCHE, dans
-- une fenêtre de 5 s (large marge sur l'écart réel de quelques ms). Le
-- sous-select "plus proche" évite un mauvais lien si plusieurs posts/défis du
-- même auteur tombent dans la fenêtre. Si rien ne matche (élément supprimé
-- depuis), `entity_id` reste NULL — comportement correct : rien à ouvrir.

UPDATE notifications n
SET entity_id = p.id::text
FROM posts p
WHERE n.kind = 'post' AND n.entity_id IS NULL
  AND n.space_id = p.space_id AND n.actor_id = p.author_id
  AND n.created_at BETWEEN p.created_at - INTERVAL '5 seconds'
                       AND p.created_at + INTERVAL '5 seconds'
  AND p.id = (
      SELECT p2.id FROM posts p2
      WHERE p2.space_id = n.space_id AND p2.author_id = n.actor_id
      ORDER BY abs(extract(epoch FROM (n.created_at - p2.created_at)))
      LIMIT 1
  );

-- comment → entity_id = id du POST commenté (comme 0035), pas du commentaire.
UPDATE notifications n
SET entity_id = c.post_id::text
FROM post_comments c
JOIN posts p ON p.id = c.post_id
WHERE n.kind = 'comment' AND n.entity_id IS NULL
  AND n.space_id = p.space_id AND n.actor_id = c.author_id
  AND n.created_at BETWEEN c.created_at - INTERVAL '5 seconds'
                       AND c.created_at + INTERVAL '5 seconds'
  AND c.id = (
      SELECT c2.id FROM post_comments c2
      JOIN posts p2 ON p2.id = c2.post_id
      WHERE p2.space_id = n.space_id AND c2.author_id = n.actor_id
      ORDER BY abs(extract(epoch FROM (n.created_at - c2.created_at)))
      LIMIT 1
  );

-- challenge → entity_id = id du défi proposé.
UPDATE notifications n
SET entity_id = ch.id::text
FROM challenges ch
WHERE n.kind = 'challenge' AND n.entity_id IS NULL
  AND n.space_id = ch.space_id AND n.actor_id = ch.proposer_id
  AND n.created_at BETWEEN ch.created_at - INTERVAL '5 seconds'
                       AND ch.created_at + INTERVAL '5 seconds'
  AND ch.id = (
      SELECT ch2.id FROM challenges ch2
      WHERE ch2.space_id = n.space_id AND ch2.proposer_id = n.actor_id
      ORDER BY abs(extract(epoch FROM (n.created_at - ch2.created_at)))
      LIMIT 1
  );
