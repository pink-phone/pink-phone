-- Empêche deux comptes de partager le même oidc_sub (défense en profondeur pour
-- l'upsert OIDC concurrent — RUST-05). Index PARTIEL : les comptes mot de passe
-- (oidc_sub NULL) ne sont pas contraints (Postgres traite les NULL comme distincts).
CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_sub_key
    ON users (oidc_sub) WHERE oidc_sub IS NOT NULL;
