-- Dimensions d'origine du média (best-effort, calculées à l'upload) : permet au
-- frontend de poser le bon ratio d'affichage avant le premier chargement du
-- fichier (médias authentifiés chargés paresseusement, révélés au press-and-hold).
-- NULL pour les médias existants (jamais rétro-remplies) et pour les formats non
-- couverts (vidéo, HEIC/HEIF) : le frontend retombe alors sur son ratio par
-- défaut puis affine dès que le fichier charge côté client.
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;
