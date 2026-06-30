-- Suivi « ✓ Réalisé » de la bucket list d'envies (#99) : niveau SALON (couple),
-- pas par membre — une envie réalisée l'est pour le couple. Un row par
-- (salon, code). L'intérêt privé (double-aveugle) reste dans `desire_interests`.
CREATE TABLE desire_done (
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    code     TEXT NOT NULL,
    done_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (space_id, code)
);
