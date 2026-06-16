-- Réactions paramétrables par salon : liste ordonnée des réactions prédéfinies
-- actives, et autorisation des réactions emoji libres.
ALTER TABLE spaces
    ADD COLUMN reactions TEXT[] NOT NULL
        DEFAULT ARRAY['heart', 'fire', 'smirk', 'breath', 'hush'],
    ADD COLUMN allow_custom_reactions BOOLEAN NOT NULL DEFAULT true;
