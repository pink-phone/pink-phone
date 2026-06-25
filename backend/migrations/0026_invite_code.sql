-- Code d'invitation lisible (#89) : on ajoute une colonne `code` mémorisable
-- (« MotMot#chiffre », ex. EmberVelvet#7) à côté du token UUID interne (qui
-- reste la clé primaire). Le code EST désormais ce que l'utilisateur partage et
-- saisit ; la recherche/unicité est insensible à la casse (index sur lower).
ALTER TABLE space_invites ADD COLUMN code TEXT;

-- Backfill des invitations existantes (éphémères) avec leur token en repli, le
-- temps qu'elles expirent ; les nouvelles reçoivent un vrai code lisible.
UPDATE space_invites SET code = token::text WHERE code IS NULL;

ALTER TABLE space_invites ALTER COLUMN code SET NOT NULL;

-- Unicité + lookup insensibles à la casse.
CREATE UNIQUE INDEX idx_space_invites_code ON space_invites (lower(code));
