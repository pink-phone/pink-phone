-- Invitations de salon (SEC-005) : rejoindre un salon ne se fait plus en
-- connaissant son UUID brut, mais via un token d'invitation à USAGE UNIQUE et
-- expirable, généré par un membre. Évite qu'un space_id fuité ouvre l'accès.
CREATE TABLE space_invites (
    token      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    used_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_space_invites_space ON space_invites(space_id);
