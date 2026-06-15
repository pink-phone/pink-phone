-- Banque de propositions de défis (curée, globale) : de quoi démarrer sans
-- page blanche. Intensité en TEXT alignée 1:1 sur le frontend ('soft'/'hot'/'hard').
CREATE TABLE challenge_suggestions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    intensity   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO challenge_suggestions (title, description, intensity) VALUES
-- Soft
('Le mot interdit', 'Un seul SMS aujourd''hui, le plus suggestif possible — sans rien dire d''explicite.', 'soft'),
('Compliment volé', 'Glisse-lui à l''oreille, là maintenant, ce que tu préfères chez elle/lui.', 'soft'),
('Rendez-vous galant', 'Comme au premier soir : on se prépare, on se redécouvre, sans précipitation.', 'soft'),
('Playlist secrète', 'Prépare trois morceaux pour un slow improvisé ce soir, dans le salon.', 'soft'),
('Le baiser de dix secondes', 'Au prochain au revoir, on compte vraiment jusqu''à dix.', 'soft'),
-- Hot
('Massage aux huiles', 'Une heure rien que pour l''autre, lumière tamisée, sans téléphone.', 'hot'),
('Douche à deux', 'On se savonne mutuellement, on ne se presse pas.', 'hot'),
('Lettre brûlante', 'Écris noir sur blanc une envie que tu n''as jamais osé dire à voix haute.', 'hot'),
('Dîner sans couverts', 'On se nourrit l''un l''autre, à la main, les yeux dans les yeux.', 'hot'),
('Effeuillage maladroit', 'Pas besoin que ce soit parfait — juste pour toi, juste ce soir.', 'hot'),
-- Hard
('Soirée à l''aveugle', 'Bandeau sur les yeux, tu te laisses guider toute la soirée.', 'hard'),
('Mains attachées', 'Un foulard, et c''est l''autre qui mène — tout en douceur.', 'hard'),
('Le silence imposé', 'Une heure sans un mot : rien que les gestes et les regards.', 'hard'),
('Carte au trésor', 'Cache des indices dans la maison menant à une surprise… intime.', 'hard'),
('Roulette des envies', 'Chacun écrit trois désirs, on tire au sort, on honore le résultat.', 'hard');
