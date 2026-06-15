-- Fuseau horaire du salon. Sert au renouvellement "calendaire" du mood :
-- l'humeur se périme au passage de minuit dans ce fuseau (et non après une
-- fenêtre glissante de 24h). Défaut : Europe/Paris ; nom IANA validé par la
-- conversion AT TIME ZONE côté requêtes.
ALTER TABLE spaces ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Paris';
