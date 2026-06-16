-- Support OIDC : un utilisateur peut être créé sans mot de passe (SSO uniquement),
-- et lié au fournisseur par son identifiant `sub`.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN oidc_sub TEXT UNIQUE;
