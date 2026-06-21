-- Révocation de session (SEC-003). Tout jeton émis AVANT cette borne est rejeté.
-- NULL = aucune révocation. « Se déconnecter de tous les appareils » la fixe à now(),
-- ce qui invalide instantanément tous les JWT de l'utilisateur (perte/vol d'appareil).
ALTER TABLE users ADD COLUMN min_token_iat TIMESTAMPTZ;
