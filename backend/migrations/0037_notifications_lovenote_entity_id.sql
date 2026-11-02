-- Jusqu'ici, `loveNote` était jugé sans item précis à ouvrir (entity_id
-- toujours NULL, cf. 0033-0036) : le centre de notifications se contentait
-- d'amener sur le dashboard. Il fait maintenant clignoter le mot doux exact,
-- comme un post — `notify_members` pose désormais `entity_id` directement à
-- l'insertion (cf. routes/love_notes.rs). Relie l'historique déjà en base.
--
-- Correspondance temporelle la PLUS PROCHE (comme 0036), pas égalité stricte :
-- un mot immédiat est notifié quelques ms après son propre `now()` (deux
-- INSERT distincts) ; un mot différé référence `open_at` (heure de
-- délivrance réelle), pas `created_at` (heure de rédaction, potentiellement
-- bien antérieure). Si rien ne matche (mot supprimé depuis), entity_id reste
-- NULL — comportement correct : rien à ouvrir.
UPDATE notifications n
SET entity_id = ln.id::text
FROM love_notes ln
WHERE n.kind = 'loveNote' AND n.entity_id IS NULL
  AND n.space_id = ln.space_id AND n.actor_id = ln.author_id
  AND n.created_at BETWEEN coalesce(ln.open_at, ln.created_at) - INTERVAL '5 seconds'
                       AND coalesce(ln.open_at, ln.created_at) + INTERVAL '5 seconds'
  AND ln.id = (
      SELECT ln2.id FROM love_notes ln2
      WHERE ln2.space_id = n.space_id AND ln2.author_id = n.actor_id
      ORDER BY abs(extract(epoch FROM (n.created_at - coalesce(ln2.open_at, ln2.created_at))))
      LIMIT 1
  );
