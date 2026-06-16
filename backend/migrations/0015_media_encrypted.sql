-- Chiffrement des médias au repos : indique si le fichier sur disque est
-- chiffré (AES-256-GCM). Les médias existants restent en clair (false).
ALTER TABLE media ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT false;
