-- #78 Téléchargement des médias.
-- Défaut par salon : comportement par défaut des nouveaux posts (OFF = intime).
ALTER TABLE spaces ADD COLUMN allow_media_download BOOLEAN NOT NULL DEFAULT false;
-- Override par post (figé à la création depuis le défaut du salon, éditable).
ALTER TABLE posts ADD COLUMN allow_download BOOLEAN NOT NULL DEFAULT false;
