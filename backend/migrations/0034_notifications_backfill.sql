-- Backfill unique de l'historique dans `notifications` (0033), pour que le
-- centre de notifications ne démarre pas vide pour les salons existants.
-- Toutes les lignes sont insérées `read_at = now()` : sans ça, tout le monde
-- se réveillerait avec des dizaines de "non lus" sur des événements déjà vus
-- depuis longtemps dans l'app, ce qui viderait le compteur non-lu de son sens.
--
-- Portée : reconstruction EXACTE pour post/comment/challenge/loveNote/
-- memberJoined/downloadEnabled (l'historique source existe avec le bon
-- horodatage et le bon acteur). Reconstruction APPROXIMATIVE pour desire et
-- eveningMenu (le "match" n'est pas stocké tel quel : on le déduit du 2ᵉ
-- intérêt/coche sur un même code, ce qui peut légèrement décaler l'horodatage
-- si un stance a été changé après coup plutôt que créé directement à 'want').
-- `mood` est VOLONTAIREMENT ABSENT : la table `moods` n'a qu'une ligne par
-- (user, space) — l'humeur du jour écrase la précédente, aucun historique des
-- jours passés ne subsiste, donc rien à reconstruire.
--
-- Une migration `sqlx` ne s'exécute qu'une fois par base (suivi dans
-- `_sqlx_migrations`) : pas besoin de garde d'idempotence supplémentaire.

-- post (hors brouillons) → tous les autres membres actuels du salon.
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT p.space_id, m.user_id, 'post', p.author_id, now(), p.created_at
FROM posts p
JOIN space_memberships m ON m.space_id = p.space_id AND m.user_id <> p.author_id
WHERE p.draft = false;

-- comment → tous les autres membres actuels du salon du post commenté.
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT p.space_id, m.user_id, 'comment', c.author_id, now(), c.created_at
FROM post_comments c
JOIN posts p ON p.id = c.post_id
JOIN space_memberships m ON m.space_id = p.space_id AND m.user_id <> c.author_id;

-- challenge → tous les autres membres actuels du salon.
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT ch.space_id, m.user_id, 'challenge', ch.proposer_id, now(), ch.created_at
FROM challenges ch
JOIN space_memberships m ON m.space_id = ch.space_id AND m.user_id <> ch.proposer_id;

-- loveNote → seulement les mots réellement délivrés (immédiats, ou différés déjà
-- notifiés) ; horodatage = déverrouillage réel (`open_at`) pour un mot différé,
-- pas sa date de rédaction.
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT ln.space_id, m.user_id, 'loveNote', ln.author_id, now(),
       COALESCE(ln.open_at, ln.created_at)
FROM love_notes ln
JOIN space_memberships m ON m.space_id = ln.space_id AND m.user_id <> ln.author_id
WHERE ln.open_at IS NULL OR ln.notified = true;

-- memberJoined / downloadEnabled → déjà dans `space_notices`, copie directe.
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT n.space_id, m.user_id,
       CASE n.kind
           WHEN 'member_joined' THEN 'memberJoined'
           WHEN 'download_enabled' THEN 'downloadEnabled'
       END,
       n.actor_id, now(), n.created_at
FROM space_notices n
JOIN space_memberships m
    ON m.space_id = n.space_id AND (n.actor_id IS NULL OR m.user_id <> n.actor_id)
WHERE n.kind IN ('member_joined', 'download_enabled');

-- desire → "match" reconstruit comme le 2ᵉ intérêt 'want' sur un même code
-- (même logique que `matched = interested && other_want` dans desires.rs).
WITH ranked_wants AS (
    SELECT space_id, code, user_id, created_at,
           row_number() OVER (PARTITION BY space_id, code ORDER BY created_at) AS rn
    FROM desire_interests
    WHERE stance = 'want'
),
desire_matches AS (
    SELECT space_id, code, user_id AS actor_id, created_at
    FROM ranked_wants
    WHERE rn = 2
)
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT dm.space_id, m.user_id, 'desire', dm.actor_id, now(), dm.created_at
FROM desire_matches dm
JOIN space_memberships m ON m.space_id = dm.space_id AND m.user_id <> dm.actor_id;

-- eveningMenu → même logique, mais le "match" est borné au jour calendaire
-- (`other_picked` dans evening_menu.rs compare uniquement les coches du jour).
WITH ranked_picks AS (
    SELECT space_id, code, day, user_id, created_at,
           row_number() OVER (PARTITION BY space_id, code, day ORDER BY created_at) AS rn
    FROM evening_menu_picks
),
evening_matches AS (
    SELECT space_id, user_id AS actor_id, created_at
    FROM ranked_picks
    WHERE rn = 2
)
INSERT INTO notifications (space_id, user_id, kind, actor_id, read_at, created_at)
SELECT em.space_id, m.user_id, 'eveningMenu', em.actor_id, now(), em.created_at
FROM evening_matches em
JOIN space_memberships m ON m.space_id = em.space_id AND m.user_id <> em.actor_id;
