-- Mode aveugle, une fois les menus dévoilés : on peut valider (« Partant·e ») ou
-- refuser les idées de l'autre. Un choix posé APRÈS le dévoilement est marqué
-- `after_reveal` : il permet de distinguer un match « par coïncidence » (les deux
-- l'avaient coché en aveugle) d'un item « validé ensemble » après coup, et de
-- n'autoriser le retrait que de ces réponses tardives (le menu d'origine reste figé).
ALTER TABLE evening_menu_picks ADD COLUMN after_reveal BOOLEAN NOT NULL DEFAULT false;
