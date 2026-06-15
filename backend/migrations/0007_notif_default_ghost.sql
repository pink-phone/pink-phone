-- Le mode de notification par défaut (sans choix de l'utilisateur) devient
-- 'ghost' : discrétion par défaut, le push ne part qu'après activation explicite.
ALTER TABLE user_settings ALTER COLUMN notif_mode SET DEFAULT 'ghost';
