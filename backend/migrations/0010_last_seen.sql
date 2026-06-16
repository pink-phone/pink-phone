-- "Vu" par feature : horodatage de dernière consultation d'un fil (blog/défis)
-- par un utilisateur dans un salon. Sert aux badges "nouveautés" du dashboard
-- et aux accusés de lecture (un contenu est "vu" si seen_at >= created_at).
CREATE TABLE space_last_seen (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    feature  TEXT NOT NULL,                 -- 'blog' | 'challenges'
    seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, space_id, feature)
);
