-- Vote d'humeur « à l'aveugle » au niveau salon : tant qu'un membre n'a pas posé
-- son humeur du jour, celle du/des partenaires lui reste masquée. Révélation
-- mutuelle dès que tout le monde a voté. Désactivé par défaut.
ALTER TABLE spaces
    ADD COLUMN blind_mood boolean NOT NULL DEFAULT false;
