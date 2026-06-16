-- Banque de défis : i18n + suggestions propres au salon.
-- - locale : langue de la proposition (le listing filtre dessus, repli 'fr').
-- - space_id : NULL = suggestion globale (seed), sinon propre au salon (éditable
--   par ses membres). created_by : auteur (info).
ALTER TABLE challenge_suggestions
    ADD COLUMN locale TEXT NOT NULL DEFAULT 'fr',
    ADD COLUMN space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
    ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_suggestions_scope ON challenge_suggestions(space_id, locale);
