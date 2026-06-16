-- Suppression de l'intensité "hard" (peu distincte de "hot") : on bascule les
-- données existantes vers "hot". La validation applicative n'accepte plus que
-- 'soft' | 'hot'.
UPDATE challenges SET intensity = 'hot' WHERE intensity = 'hard';
UPDATE challenge_suggestions SET intensity = 'hot' WHERE intensity = 'hard';
