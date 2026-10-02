//! Tests d'intégration des routes DB-bound restées sous 50 % de couverture
//! (backlog #92, suite) : interactions (réactions, verdicts, commentaires),
//! défis (liste/édition/suppression) et salons (création, réglages, invitations,
//! membres). Priorité : l'autorisation par salon et par auteur.
//!
//! Même garde que `tests_integration` : feature `integration` + Postgres jetable.

use axum::http::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::tests_integration::{
    add_member, build_app_with, create_challenge, create_post, req, seed_space, seed_user,
    test_config, token_for,
};

fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

// =====================================================================
// Interactions : réactions
// =====================================================================

#[sqlx::test]
async fn reactions_ajout_doublon_emoji_libre_retrait_et_validation(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let post = create_post(&app, space, &ta, "bonjour").await;
    let base = format!("/api/spaces/{space}/posts/{post}/reactions");

    let (st, s) = req(&app, "POST", &base, &ta, Some(json!({"reaction": "heart"}))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["reactionCounts"]["heart"], 1);
    assert_eq!(s["myReactions"], json!(["heart"]));

    // Doublon : idempotent (ON CONFLICT DO NOTHING), le compteur ne bouge pas.
    let (_, s) = req(&app, "POST", &base, &ta, Some(json!({"reaction": "heart"}))).await;
    assert_eq!(s["reactionCounts"]["heart"], 1);

    // Emoji libre accepté, espaces autour ignorés.
    let (st, s) = req(&app, "POST", &base, &tb, Some(json!({"reaction": " 🔥 "}))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["reactionCounts"]["🔥"], 1);
    // « mes » réactions = celles de l'appelant seulement.
    assert_eq!(s["myReactions"], json!(["🔥"]));

    // Texte / vide refusés.
    for bad in ["lol", "", "🔥 ok"] {
        let (st, _) = req(&app, "POST", &base, &ta, Some(json!({"reaction": bad}))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{bad:?}");
    }

    // Retrait : ne retire que MA réaction (bob retire 🔥, la sienne ; heart d'alice reste).
    let (st, s) = req(&app, "DELETE", &format!("{base}/{}", enc("🔥")), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert!(s["reactionCounts"].get("🔥").is_none());
    assert_eq!(s["reactionCounts"]["heart"], 1);
    // Bob tente de retirer le heart d'alice : sans effet.
    let (st, s) = req(&app, "DELETE", &format!("{base}/heart"), &tb, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["reactionCounts"]["heart"], 1);
}

#[sqlx::test]
async fn interactions_refusent_non_membre_et_post_d_un_autre_salon(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space_a = seed_space(&pool, alice).await;
    let space_b = seed_space(&pool, bob).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let post_a = create_post(&app, space_a, &ta, "privé").await;
    let post_b = create_post(&app, space_b, &tb, "autre").await;

    let a = format!("/api/spaces/{space_a}/posts/{post_a}");
    // Bob (non membre du salon A) : tout est refusé (403).
    for (m, p, body) in [
        (
            "POST",
            format!("{a}/reactions"),
            Some(json!({"reaction": "heart"})),
        ),
        ("DELETE", format!("{a}/reactions/heart"), None),
        (
            "PUT",
            format!("{a}/verdict"),
            Some(json!({"verdict": "hot"})),
        ),
        ("DELETE", format!("{a}/verdict"), None),
        ("GET", format!("{a}/comments"), None),
        ("POST", format!("{a}/comments"), Some(json!({"body": "x"}))),
    ] {
        let (st, _) = req(&app, m, &p, &tb, body).await;
        assert_eq!(st, StatusCode::FORBIDDEN, "{m} {p}");
    }
    // Alice vise, dans SON salon, un post qui appartient au salon B : 404 (pas de fuite).
    let croise = format!("/api/spaces/{space_a}/posts/{post_b}");
    let (st, _) = req(
        &app,
        "POST",
        &format!("{croise}/reactions"),
        &ta,
        Some(json!({"reaction": "heart"})),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = req(&app, "GET", &format!("{croise}/comments"), &ta, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

// =====================================================================
// Interactions : verdict
// =====================================================================

#[sqlx::test]
async fn verdict_pose_remplace_efface_et_valide(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let post = create_post(&app, space, &ta, "verdict").await;
    let url = format!("/api/spaces/{space}/posts/{post}/verdict");

    let (st, v) = req(&app, "PUT", &url, &tb, Some(json!({"verdict": "hot"}))).await;
    assert_eq!((st, v["verdict"].as_str()), (StatusCode::OK, Some("hot")));
    // Remplacement (un seul verdict par personne et par post).
    let (_, v) = req(&app, "PUT", &url, &tb, Some(json!({"verdict": "curious"}))).await;
    assert_eq!(v["verdict"], "curious");
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM post_verdicts WHERE post_id = $1")
        .bind(post)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);

    let (st, _) = req(&app, "PUT", &url, &tb, Some(json!({"verdict": "meh"}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Alice efface SON verdict (aucun) : celui de bob reste.
    let (st, v) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert!(v["verdict"].is_null());
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM post_verdicts WHERE post_id = $1")
        .bind(post)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
    let (_, v) = req(&app, "DELETE", &url, &tb, None).await;
    assert!(v["verdict"].is_null());
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM post_verdicts WHERE post_id = $1")
        .bind(post)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

// =====================================================================
// Interactions : commentaires (liste paginée, édition)
// =====================================================================

#[sqlx::test]
async fn commentaires_liste_paginee_recents_d_abord_et_edition_par_l_auteur(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let post = create_post(&app, space, &ta, "fil").await;
    let base = format!("/api/spaces/{space}/posts/{post}/comments");

    let mut ids = Vec::new();
    for (tok, txt) in [(&ta, "un"), (&tb, "deux"), (&ta, "trois")] {
        let (st, c) = req(
            &app,
            "POST",
            &base,
            tok,
            Some(json!({"body": format!(" {txt} ")})),
        )
        .await;
        assert_eq!(st, StatusCode::CREATED);
        assert_eq!(c["body"], txt); // trimé
        ids.push(c["id"].as_str().unwrap().to_string());
    }

    // Page 1 : les 2 plus récents (trois, deux), il en reste un.
    let (st, p1) = req(&app, "GET", &format!("{base}?limit=2"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    let bodies: Vec<_> = p1["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["body"].as_str().unwrap())
        .collect();
    assert_eq!(bodies, vec!["trois", "deux"]);
    assert_eq!(p1["hasMore"], true);
    assert_eq!(p1["items"][1]["authorName"], "bob");

    // Page 2 via curseur : le plus ancien.
    let cursor = enc(p1["items"][1]["createdAt"].as_str().unwrap());
    let (_, p2) = req(
        &app,
        "GET",
        &format!("{base}?limit=2&before={cursor}"),
        &ta,
        None,
    )
    .await;
    assert_eq!(p2["items"].as_array().unwrap().len(), 1);
    assert_eq!(p2["items"][0]["body"], "un");
    assert_eq!(p2["hasMore"], false);

    // Édition : par l'auteur uniquement.
    let mine = format!("{base}/{}", ids[0]); // « un », écrit par alice
    let (st, c) = req(
        &app,
        "PATCH",
        &mine,
        &ta,
        Some(json!({"body": "  un (édité) "})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(c["body"], "un (édité)");
    let (st, _) = req(&app, "PATCH", &mine, &tb, Some(json!({"body": "piraté"}))).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Validation : vide / trop long.
    let (st, _) = req(&app, "PATCH", &mine, &ta, Some(json!({"body": "   "}))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = req(
        &app,
        "PATCH",
        &mine,
        &ta,
        Some(json!({"body": "x".repeat(8 * 1024 + 1)})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // Commentaire inexistant.
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("{base}/{}", Uuid::new_v4()),
        &ta,
        Some(json!({"body": "x"})),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Le texte d'origine n'a pas été écrasé par les tentatives refusées.
    let body: String = sqlx::query_scalar("SELECT body FROM post_comments WHERE id = $1")
        .bind(Uuid::parse_str(&ids[0]).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(body, "un (édité)");
}

// =====================================================================
// Défis : liste, édition, suppression, suggestion d'origine
// =====================================================================

#[sqlx::test]
async fn defis_liste_paginee_et_cloisonnee_par_salon(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space_a = seed_space(&pool, alice).await;
    let space_b = seed_space(&pool, bob).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    for _ in 0..3 {
        create_challenge(&app, space_a, &ta).await;
    }
    create_challenge(&app, space_b, &tb).await;
    let base = format!("/api/spaces/{space_a}/challenges");

    let (st, p1) = req(&app, "GET", &format!("{base}?limit=2"), &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p1["items"].as_array().unwrap().len(), 2);
    assert_eq!(p1["hasMore"], true);
    let cursor = enc(p1["items"][1]["createdAt"].as_str().unwrap());
    let (_, p2) = req(
        &app,
        "GET",
        &format!("{base}?limit=2&before={cursor}"),
        &ta,
        None,
    )
    .await;
    assert_eq!(p2["items"].as_array().unwrap().len(), 1);
    assert_eq!(p2["hasMore"], false);

    // Pas de fuite du défi du salon B, et bob ne peut pas lister le salon A.
    let (_, all) = req(&app, "GET", &base, &ta, None).await;
    assert_eq!(all["items"].as_array().unwrap().len(), 3);
    let (st, _) = req(&app, "GET", &base, &tb, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn defi_edition_par_le_proposeur_validation_et_autz(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let space_b = seed_space(&pool, bob).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let ch = create_challenge(&app, space, &ta).await;
    let url = format!("/api/spaces/{space}/challenges/{ch}");
    let ok = json!({"title": "  Nouveau titre ", "description": " d ", "intensity": "soft",
                    "deadlineLabel": "  ce soir "});

    let (st, c) = req(&app, "PATCH", &url, &ta, Some(ok.clone())).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(c["title"], "Nouveau titre");
    assert_eq!(c["description"], "d");
    assert_eq!(c["intensity"], "soft");
    assert_eq!(c["deadlineLabel"], "ce soir");
    // Échéance vide ⇒ effacée.
    let (_, c) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({"title": "T", "description": "", "intensity": "hot", "deadlineLabel": "  "})),
    )
    .await;
    assert!(c["deadlineLabel"].is_null());

    // Seul le proposeur édite : bob (membre du salon) → 403.
    let (st, _) = req(&app, "PATCH", &url, &tb, Some(ok.clone())).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Défi inconnu → 404 ; non-membre du salon → 403.
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}/challenges/{}", Uuid::new_v4()),
        &ta,
        Some(ok.clone()),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let tc = token_for(&state, seed_user(&pool, "carol").await);
    let (st, _) = req(&app, "PATCH", &url, &tc, Some(ok.clone())).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Défi du salon A visé depuis le salon B par un membre de B : 404 (cloisonné).
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space_b}/challenges/{ch}"),
        &tb,
        Some(ok),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Validation.
    for body in [
        json!({"title": "  ", "description": "", "intensity": "hot"}),
        json!({"title": "x".repeat(201), "description": "", "intensity": "hot"}),
        json!({"title": "ok", "description": "x".repeat(8 * 1024 + 1), "intensity": "hot"}),
        json!({"title": "ok", "description": "", "intensity": "extreme"}),
    ] {
        let (st, _) = req(&app, "PATCH", &url, &ta, Some(body)).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
}

#[sqlx::test]
async fn defi_suppression_par_le_proposeur_uniquement(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let ch = create_challenge(&app, space, &ta).await;
    let url = format!("/api/spaces/{space}/challenges/{ch}");

    let (st, _) = req(&app, "DELETE", &url, &tb, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await; // déjà supprimé
    assert_eq!(st, StatusCode::NOT_FOUND);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM challenges WHERE space_id = $1")
        .bind(space)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[sqlx::test]
async fn defi_creation_valide_la_suggestion_d_origine_et_les_champs(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space_a = seed_space(&pool, alice).await;
    let space_b = seed_space(&pool, bob).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let base = format!("/api/spaces/{space_a}/challenges");
    let body = |extra: Value| {
        let mut b = json!({"title": "Idée", "description": "d", "intensity": "soft"});
        for (k, v) in extra.as_object().unwrap() {
            b[k] = v.clone();
        }
        b
    };

    // Suggestion du salon A : acceptée et liée.
    let (_, sa) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space_a}/suggestions"),
        &ta,
        Some(json!({"title": "S", "description": "", "intensity": "hot"})),
    )
    .await;
    let sid = sa["id"].as_str().unwrap();
    let (st, c) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(body(json!({"sourceSuggestionId": sid}))),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    let src: Option<Uuid> =
        sqlx::query_scalar("SELECT source_suggestion_id FROM challenges WHERE id = $1")
            .bind(Uuid::parse_str(c["id"].as_str().unwrap()).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(src.unwrap().to_string(), sid);

    // Suggestion PRIVÉE du salon B : refusée à alice (SEC-NEW-002). Inconnue : idem.
    let (_, sb) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space_b}/suggestions"),
        &tb,
        Some(json!({"title": "Secret", "description": "", "intensity": "hot"})),
    )
    .await;
    for bad in [
        sb["id"].as_str().unwrap().to_string(),
        Uuid::new_v4().to_string(),
    ] {
        let (st, _) = req(
            &app,
            "POST",
            &base,
            &ta,
            Some(body(json!({"sourceSuggestionId": bad}))),
        )
        .await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }

    // Validation des champs.
    for extra in [
        json!({"title": ""}),
        json!({"title": "x".repeat(201)}),
        json!({"description": "x".repeat(8 * 1024 + 1)}),
        json!({"intensity": "inconnue"}),
    ] {
        let (st, _) = req(&app, "POST", &base, &ta, Some(body(extra))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
    // Non-membre.
    let (st, _) = req(&app, "POST", &base, &tb, Some(body(json!({})))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

// =====================================================================
// Salons
// =====================================================================

#[sqlx::test]
async fn salon_creation_liste_et_membres(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));

    // Nom vide refusé ; sinon créé (trimé), le créateur en est membre.
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces",
        &ta,
        Some(json!({"name": "   "})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, s) = req(
        &app,
        "POST",
        "/api/spaces",
        &ta,
        Some(json!({"name": "  Notre salon "})),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    assert_eq!(s["name"], "Notre salon");
    let space = Uuid::parse_str(s["id"].as_str().unwrap()).unwrap();

    // « Mes salons » : seulement les miens.
    let (st, mine) = req(&app, "GET", "/api/spaces/me", &ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(mine.as_array().unwrap().len(), 1);
    let (_, none) = req(&app, "GET", "/api/spaces/me", &tb, None).await;
    assert_eq!(none.as_array().unwrap().len(), 0);

    // Membres : liste pour un membre, 403 sinon.
    add_member(&pool, bob, space).await;
    let (st, m) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/members"),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let names: Vec<_> = m
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["displayName"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["alice", "bob"]);
    assert_eq!(m[0]["role"], "partner");
    let tc = token_for(&state, seed_user(&pool, "carol").await);
    let (st, _) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/members"),
        &tc,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn salon_reglages_nom_fuseau_reactions_et_drapeaux(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let url = format!("/api/spaces/{space}");

    let (st, s) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({
            "name": "  Cocon ", "timezone": "Europe/Paris",
            "reactions": ["fire", "heart"], "allowCustomReactions": false,
            "blindMood": true,
        })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["name"], "Cocon");
    assert_eq!(s["timezone"], "Europe/Paris");
    assert_eq!(s["reactions"], json!(["fire", "heart"])); // ordre voulu conservé
    assert_eq!(s["allowCustomReactions"], false);
    assert_eq!(s["blindMood"], true);

    // PATCH partiel : les champs absents ne bougent pas (COALESCE).
    let (_, s) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({"allowMediaDownload": true})),
    )
    .await;
    assert_eq!(s["allowMediaDownload"], true);
    assert_eq!(s["name"], "Cocon");
    assert_eq!(s["blindMood"], true);

    // Refus : nom vide, fuseau inconnu, réaction inconnue, non-membre.
    for bad in [
        json!({"name": " "}),
        json!({"timezone": "Mars/Olympus"}),
        json!({"reactions": ["heart", "pizza"]}),
    ] {
        let (st, _) = req(&app, "PATCH", &url, &ta, Some(bad)).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
    let (st, _) = req(&app, "PATCH", &url, &tb, Some(json!({"name": "pirate"}))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let name: String = sqlx::query_scalar("SELECT name FROM spaces WHERE id = $1")
        .bind(space)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Cocon");
}

#[sqlx::test]
async fn invitation_refuse_expiree_utilisee_et_salon_complet(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let invites = format!("/api/spaces/{space}/invites");

    // Non-membre : ne peut pas créer d'invitation.
    let tz = token_for(&state, seed_user(&pool, "zoe").await);
    let (st, _) = req(&app, "POST", &invites, &tz, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    // Invitation expirée → 409.
    let (_, inv) = req(&app, "POST", &invites, &ta, None).await;
    let code = inv["code"].as_str().unwrap().to_string();
    sqlx::query(
        "UPDATE space_invites SET expires_at = now() - interval '1 day' WHERE space_id = $1",
    )
    .bind(space)
    .execute(&pool)
    .await
    .unwrap();
    let bob = seed_user(&pool, "bob").await;
    let tb = token_for(&state, bob);
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({"code": code})),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // Une invitation expirée n'est pas « active » : un nouveau code est frappé.
    let (st, inv2) = req(&app, "POST", &invites, &ta, None).await;
    assert_eq!(st, StatusCode::CREATED);
    let code2 = inv2["code"].as_str().unwrap().to_string();
    assert_ne!(code, code2);
    let (st, s) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({"code": code2.clone()})),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    assert_eq!(s["id"], space.to_string());

    // Déjà utilisée : un tiers ne peut plus la réutiliser (409)…
    let carol = seed_user(&pool, "carol").await;
    let tc = token_for(&state, carol);
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tc,
        Some(json!({"code": code2.clone()})),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);
    // …et bob, qui l'a consommée, n'y retourne pas non plus : le contrôle « utilisée »
    // précède celui « déjà membre » (le cas 200 est couvert par le test dédié).
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({"code": code2})),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // Salon complet : 8 membres max (#52).
    for i in 0..6 {
        let u = seed_user(&pool, &format!("m{i}")).await;
        add_member(&pool, u, space).await;
    }
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships WHERE space_id = $1")
        .bind(space)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 8);
    let (_, inv3) = req(&app, "POST", &invites, &ta, None).await;
    let (st, _) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tc,
        Some(json!({"code": inv3["code"]})),
    )
    .await;
    assert_eq!(st, StatusCode::CONFLICT);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships WHERE space_id = $1")
        .bind(space)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 8, "le 9ᵉ membre ne doit pas être admis");
}

#[sqlx::test]
async fn invitation_membre_existant_rejoint_sans_consommer(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let ta = token_for(&state, alice);
    let tb = token_for(&state, bob);

    let (_, inv) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/invites"),
        &ta,
        None,
    )
    .await;
    // Bob est déjà membre : 200 (pas 201), invitation NON consommée (SEC-NEW-003).
    let (st, s) = req(
        &app,
        "POST",
        "/api/spaces/join",
        &tb,
        Some(json!({"code": inv["code"]})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(s["id"], space.to_string());
    let used: i64 =
        sqlx::query_scalar("SELECT count(*) FROM space_invites WHERE used_at IS NOT NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(used, 0);
}

#[sqlx::test]
async fn purge_des_invitations_perimees_garde_les_actives(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let (_, inv) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/invites"),
        &ta,
        None,
    )
    .await;
    let active = inv["code"].as_str().unwrap().to_string();
    sqlx::query(
        "INSERT INTO space_invites (space_id, created_by, expires_at, code)
         VALUES ($1, $2, now() - interval '1 day', 'ExpiredCode#1')",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO space_invites (space_id, created_by, expires_at, code, used_at)
         VALUES ($1, $2, now() + interval '7 days', 'UsedCode#2', now())",
    )
    .bind(space)
    .bind(alice)
    .execute(&pool)
    .await
    .unwrap();

    crate::routes::spaces::purge_stale_invites(&pool).await;

    let restants: Vec<String> = sqlx::query_scalar("SELECT code FROM space_invites")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(restants, vec![active]);
    // Idempotent : rien à purger la 2ᵉ fois.
    crate::routes::spaces::purge_stale_invites(&pool).await;
}

// =====================================================================
// Humeur : retrait
// =====================================================================

#[sqlx::test]
async fn humeur_retrait_idempotent_emet_un_event_et_refuse_non_membre(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let url = format!("/api/spaces/{space}/moods/me");

    for (tok, status) in [(&ta, "flirty"), (&tb, "calm")] {
        let (st, _) = req(&app, "PUT", &url, tok, Some(json!({"status": status}))).await;
        assert_eq!(st, StatusCode::OK);
    }
    let (_, moods) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/moods"),
        &ta,
        None,
    )
    .await;
    assert_eq!(moods.as_array().unwrap().len(), 2);

    // Retrait : 204, émet un event `mood` (resync du partenaire), ne retire QUE le mien.
    let mut rx = state.events.subscribe();
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let ev = rx.try_recv().expect("event émis");
    assert_eq!((ev.space_id, ev.actor_id), (space, alice));
    assert_eq!(serde_json::to_value(&ev).unwrap()["kind"], "mood");
    let (_, moods) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/moods"),
        &tb,
        None,
    )
    .await;
    let restantes: Vec<_> = moods
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["userId"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(restantes, vec![bob.to_string()]);

    // Idempotent.
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    // Non-membre : 403, et rien n'est supprimé.
    let tc = token_for(&state, seed_user(&pool, "carol").await);
    let (st, _) = req(&app, "DELETE", &url, &tc, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM moods WHERE space_id = $1")
        .bind(space)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

// =====================================================================
// Logs client
// =====================================================================

#[sqlx::test]
async fn logs_client_authentifies_bornes_et_tolerants(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let t = token_for(&state, seed_user(&pool, "alice").await);

    // Lot normal, champs optionnels absents, caractères de contrôle, énormes valeurs
    // et plus de 50 entrées (seules 50 sont retenues) : toujours 204, jamais d'erreur.
    let mut entries: Vec<Value> = vec![
        json!({"message": "boom"}),
        json!({"level": "warn", "message": "ligne1\nligne2 \u{1b}[31m", "context": "ctx"}),
        json!({"level": "x".repeat(10_000), "message": "é".repeat(5_000), "context": "c".repeat(5_000)}),
    ];
    entries.extend((0..60).map(|i| json!({"message": format!("m{i}")})));
    let (st, _) = req(
        &app,
        "POST",
        "/api/logs",
        &t,
        Some(json!({"entries": entries, "userAgent": "UA/1.0 ".repeat(100)})),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (st, _) = req(&app, "POST", "/api/logs", &t, Some(json!({"entries": []}))).await;
    assert_eq!(st, StatusCode::NO_CONTENT);

    // Corps invalide : rejeté (pas de panique) ; sans jeton : 401.
    let (st, _) = req(
        &app,
        "POST",
        "/api/logs",
        &t,
        Some(json!({"entries": "pas-une-liste"})),
    )
    .await;
    assert!(st.is_client_error(), "{st}");
    let (st, _) = req(
        &app,
        "POST",
        "/api/logs",
        "jeton-invalide",
        Some(json!({"entries": []})),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

// =====================================================================
// Mots doux : livraison planifiée
// =====================================================================

#[sqlx::test]
async fn mots_doux_livraison_des_mots_echus_une_seule_fois(pool: PgPool) {
    let cfg = Config {
        vapid_private_key: "IQ9Ur0ykXoHS9gzfYX0aBjy9lvdrjx_PFUXmie9YRcY".into(),
        vapid_subject: "mailto:test@example.com".into(),
        ..test_config()
    };
    let (_, state) = build_app_with(pool.clone(), cfg);
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    sqlx::query("INSERT INTO user_settings (user_id, notif_mode) VALUES ($1, 'push')")
        .bind(bob)
        .execute(&pool)
        .await
        .unwrap();
    // Endpoint interne : la notif part « pour de vrai » jusqu'à la revalidation SSRF
    // qui le purge — ce qui prouve qu'un destinataire a bien été notifié, sans réseau.
    let sub = |ep: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'p', 'a')")
                .bind(bob)
                .bind(ep)
                .execute(&pool)
                .await
                .unwrap();
        }
    };
    sub("https://127.0.0.1/premiere").await;

    let note = |offset: &'static str, notified: bool| {
        let pool = pool.clone();
        async move {
            let id: Uuid = sqlx::query_scalar(
                "INSERT INTO love_notes (space_id, author_id, body, open_at, notified)
                 VALUES ($1, $2, 'mot', CASE WHEN $3 = '' THEN NULL ELSE now() + $3::interval END, $4)
                 RETURNING id",
            )
            .bind(space)
            .bind(alice)
            .bind(offset)
            .bind(notified)
            .fetch_one(&pool)
            .await
            .unwrap();
            id
        }
    };
    let echu = note("-1 hour", false).await;
    let futur = note("2 hours", false).await;
    let immediat = note("", false).await;
    let deja = note("-2 hours", true).await;

    crate::routes::love_notes::deliver_due_notes(&state).await;

    let flags: Vec<(Uuid, bool)> = sqlx::query_as("SELECT id, notified FROM love_notes")
        .fetch_all(&pool)
        .await
        .unwrap();
    let notified = |id: Uuid| flags.iter().find(|(i, _)| *i == id).unwrap().1;
    assert!(notified(echu), "le mot échu est marqué livré");
    assert!(
        !notified(futur) && !notified(immediat),
        "ni futur ni immédiat n'est touché"
    );
    assert!(notified(deja));

    // Le destinataire a bien été notifié (abonnement SSRF purgé à l'envoi).
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while sqlx::query_scalar::<_, i64>("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap()
        > 0
    {
        assert!(
            std::time::Instant::now() < deadline,
            "aucune notification émise"
        );
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // Une seule fois : 2ᵉ passe sans nouveau mot échu ⇒ le nouvel abonnement n'est pas touché.
    sub("https://127.0.0.1/seconde").await;
    crate::routes::love_notes::deliver_due_notes(&state).await;
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1, "aucune relivraison");
}

// =====================================================================
// Posts : validation, galerie, nettoyage des médias, brouillons, agrégats
// =====================================================================

/// Dossier média jetable + média réel (ligne + fichier) pour tester le nettoyage.
struct MediaDir(std::path::PathBuf);
impl MediaDir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!("pp-routes-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        MediaDir(p)
    }
    fn config(&self) -> Config {
        Config {
            media_dir: self.0.to_string_lossy().into_owned(),
            ..test_config()
        }
    }
    /// Média rattachable à un post : ligne `media` + fichier sur disque.
    async fn media(&self, pool: &PgPool, space: Uuid, owner: Uuid) -> (Uuid, std::path::PathBuf) {
        let key = Uuid::new_v4().to_string();
        std::fs::write(self.0.join(&key), b"octets").unwrap();
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO media (space_id, owner_id, storage_key, mime)
             VALUES ($1, $2, $3, 'image/jpeg') RETURNING id",
        )
        .bind(space)
        .bind(owner)
        .bind(&key)
        .fetch_one(pool)
        .await
        .unwrap();
        (id, self.0.join(key))
    }
}
impl Drop for MediaDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

async fn media_exists(pool: &PgPool, id: Uuid) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM media WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
        > 0
}

#[sqlx::test]
async fn post_creation_valide_texte_et_galerie(pool: PgPool) {
    let md = MediaDir::new();
    let (app, state) = build_app_with(pool.clone(), md.config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    let space_b = seed_space(&pool, bob).await;
    let ta = token_for(&state, alice);
    let base = format!("/api/spaces/{space}/posts");

    // Texte : titre trop long, récit trop long, ni récit ni média.
    for body in [
        json!({"title": "t".repeat(201), "body": "x"}),
        json!({"body": "x".repeat(64 * 1024 + 1)}),
        json!({"body": "   "}),
    ] {
        let (st, _) = req(&app, "POST", &base, &ta, Some(body)).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
    // Galerie : > 10 médias, média d'un autre salon, média inexistant.
    let (foreign, _) = md.media(&pool, space_b, bob).await;
    let (own, _) = md.media(&pool, space, alice).await;
    let trop: Vec<_> = (0..11).map(|_| own.to_string()).collect();
    for ids in [
        trop,
        vec![foreign.to_string()],
        vec![Uuid::new_v4().to_string()],
    ] {
        let (st, _) = req(
            &app,
            "POST",
            &base,
            &ta,
            Some(json!({"body": "x", "mediaIds": ids})),
        )
        .await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }

    // Un média seul suffit (pas de récit) ; titre vide ⇒ null ; titre trimé sinon.
    let (st, p) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"title": "  ", "body": "", "mediaIds": [own]})),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
    assert!(p["title"].is_null());
    assert_eq!(p["media"].as_array().unwrap().len(), 1);
    let (_, p) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"title": "  Mon titre ", "body": "x"})),
    )
    .await;
    assert_eq!(p["title"], "Mon titre");
}

#[sqlx::test]
async fn post_edition_titre_recit_galerie_et_nettoyage_des_medias_retires(pool: PgPool) {
    let md = MediaDir::new();
    let (app, state) = build_app_with(pool.clone(), md.config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let (m1, f1) = md.media(&pool, space, alice).await;
    let (m2, f2) = md.media(&pool, space, alice).await;
    let (_, p) = req(
        &app,
        "POST",
        &format!("/api/spaces/{space}/posts"),
        &ta,
        Some(json!({"title": "T", "body": "récit", "mediaIds": [m1, m2]})),
    )
    .await;
    let pid = p["id"].as_str().unwrap().to_string();
    let url = format!("/api/spaces/{space}/posts/{pid}");

    // Titre/récit : remplacés (trimés) ; titre vide ⇒ supprimé.
    let (st, p) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({"title": " Nouveau ", "body": " autre "})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        (p["title"].as_str(), p["body"].as_str()),
        (Some("Nouveau"), Some("autre"))
    );
    let (_, p) = req(&app, "PATCH", &url, &ta, Some(json!({"title": ""}))).await;
    assert!(p["title"].is_null());
    assert_eq!(
        p["media"].as_array().unwrap().len(),
        2,
        "galerie inchangée si absente"
    );

    // Validation.
    for body in [
        json!({"title": "t".repeat(201)}),
        json!({"mediaIds": (0..11).map(|_| m1.to_string()).collect::<Vec<_>>()}),
        json!({"mediaIds": [Uuid::new_v4()]}),
    ] {
        let (st, _) = req(&app, "PATCH", &url, &ta, Some(body)).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
    // Vider récit ET galerie ⇒ plus rien : refusé.
    let (st, _) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({"body": " ", "mediaIds": []})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(media_exists(&pool, m1).await && f1.exists());

    // Retirer m2 de la galerie : ligne ET fichier supprimés ; m1 reste.
    let (st, p) = req(&app, "PATCH", &url, &ta, Some(json!({"mediaIds": [m1]}))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p["media"].as_array().unwrap().len(), 1);
    assert!(!media_exists(&pool, m2).await && !f2.exists());
    assert!(media_exists(&pool, m1).await && f1.exists());

    // Seul l'auteur édite (bob → 403) ; post inconnu → 404.
    let (st, _) = req(&app, "PATCH", &url, &tb, Some(json!({"body": "piraté"}))).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = req(
        &app,
        "PATCH",
        &format!("/api/spaces/{space}/posts/{}", Uuid::new_v4()),
        &ta,
        Some(json!({"body": "x"})),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Suppression du post : le média restant est nettoyé aussi (ligne + fichier).
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    assert!(!media_exists(&pool, m1).await && !f1.exists());
}

#[sqlx::test]
async fn post_media_partage_n_est_pas_supprime_tant_qu_un_post_le_reference(pool: PgPool) {
    let md = MediaDir::new();
    let (app, state) = build_app_with(pool.clone(), md.config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let ta = token_for(&state, alice);
    let (m, f) = md.media(&pool, space, alice).await;
    let base = format!("/api/spaces/{space}/posts");
    let (_, p1) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"body": "a", "mediaIds": [m]})),
    )
    .await;
    let (_, p2) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"body": "b", "mediaIds": [m]})),
    )
    .await;

    // Supprimer le 1er post : le média est encore référencé par le 2ᵉ ⇒ conservé.
    let (st, _) = req(
        &app,
        "DELETE",
        &format!("{base}/{}", p1["id"].as_str().unwrap()),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    assert!(media_exists(&pool, m).await && f.exists());
    let (st, _) = req(
        &app,
        "DELETE",
        &format!("{base}/{}", p2["id"].as_str().unwrap()),
        &ta,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    assert!(!media_exists(&pool, m).await && !f.exists());
}

#[sqlx::test]
async fn post_brouillon_visible_de_l_auteur_publication_repositionne_created_at(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let base = format!("/api/spaces/{space}/posts");

    let (_, d) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"body": "brouillon", "draft": true})),
    )
    .await;
    let pid = d["id"].as_str().unwrap().to_string();
    let url = format!("{base}/{pid}");
    let n = |v: &Value| v["items"].as_array().unwrap().len();
    let (_, l) = req(&app, "GET", &base, &ta, None).await;
    assert_eq!(n(&l), 1);
    let (_, l) = req(&app, "GET", &base, &tb, None).await;
    assert_eq!(n(&l), 0, "un brouillon n'est visible que de son auteur");

    // Éditer un brouillon qui reste brouillon : aucun event pour les autres.
    let mut rx = state.events.subscribe();
    let (_, p) = req(
        &app,
        "PATCH",
        &url,
        &ta,
        Some(json!({"body": "brouillon v2"})),
    )
    .await;
    assert_eq!(p["draft"], true);
    assert!(rx.try_recv().is_err());

    // Publication : devient visible, event `post`, created_at repositionné, pas « modifié ».
    let avant = p["createdAt"].as_str().unwrap().to_string();
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    let (st, p) = req(&app, "PATCH", &url, &ta, Some(json!({"draft": false}))).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(p["draft"], false);
    assert_ne!(p["createdAt"].as_str().unwrap(), avant);
    assert_eq!(p["createdAt"], p["updatedAt"]);
    assert_eq!(
        serde_json::to_value(rx.try_recv().unwrap()).unwrap()["kind"],
        "post"
    );
    let (_, l) = req(&app, "GET", &base, &tb, None).await;
    assert_eq!(n(&l), 1);

    // Remise en brouillon : le statut change ⇒ event aussi.
    let (_, p) = req(&app, "PATCH", &url, &ta, Some(json!({"draft": true}))).await;
    assert_eq!(p["draft"], true);
    assert!(rx.try_recv().is_ok());
}

#[sqlx::test]
async fn posts_liste_agrege_reactions_verdict_et_commentaires(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let pid = create_post(&app, space, &ta, "agrégats").await;
    let p = format!("/api/spaces/{space}/posts/{pid}");

    req(
        &app,
        "POST",
        &format!("{p}/reactions"),
        &ta,
        Some(json!({"reaction": "heart"})),
    )
    .await;
    req(
        &app,
        "POST",
        &format!("{p}/reactions"),
        &tb,
        Some(json!({"reaction": "heart"})),
    )
    .await;
    req(
        &app,
        "POST",
        &format!("{p}/reactions"),
        &tb,
        Some(json!({"reaction": "🔥"})),
    )
    .await;
    req(
        &app,
        "PUT",
        &format!("{p}/verdict"),
        &tb,
        Some(json!({"verdict": "hot"})),
    )
    .await;
    req(
        &app,
        "POST",
        &format!("{p}/comments"),
        &tb,
        Some(json!({"body": "salut"})),
    )
    .await;
    req(
        &app,
        "POST",
        &format!("{p}/comments"),
        &ta,
        Some(json!({"body": "coucou"})),
    )
    .await;

    // Vue d'alice.
    let (_, l) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/posts"),
        &ta,
        None,
    )
    .await;
    let post = &l["items"][0];
    assert_eq!(post["reactionCounts"]["heart"], 2);
    assert_eq!(post["reactionCounts"]["🔥"], 1);
    assert_eq!(post["myReactions"], json!(["heart"]));
    assert!(
        post["verdict"].is_null(),
        "le verdict de bob n'est pas celui d'alice"
    );
    assert_eq!(post["commentCount"], 2);
    assert!(
        post["lastCommentAt"].is_string(),
        "dernier commentaire d'un AUTRE (bob)"
    );
    // Vue de bob.
    let (_, l) = req(
        &app,
        "GET",
        &format!("/api/spaces/{space}/posts"),
        &tb,
        None,
    )
    .await;
    let post = &l["items"][0];
    assert_eq!(post["verdict"], "hot");
    let mut mine: Vec<_> = post["myReactions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    mine.sort();
    assert_eq!(mine, vec!["heart", "🔥"]);
}

// =====================================================================
// Banque de défis (suggestions) : langue, masquage, « fait », autorisations
// =====================================================================

#[sqlx::test]
async fn suggestions_langue_repli_fr_masquage_et_statut_fait(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let base = format!("/api/spaces/{space}/suggestions");

    // Le seed contient aussi de l'anglais : on le retire pour provoquer le repli.
    sqlx::query("DELETE FROM challenge_suggestions WHERE locale = 'en'")
        .execute(&pool)
        .await
        .unwrap();
    // Sans item « en » : repli sur le fr. Avec un item « en » du salon : lui seul.
    let (_, fr) = req(&app, "GET", &format!("{base}?lang=fr"), &ta, None).await;
    let (_, repli) = req(&app, "GET", &format!("{base}?lang=en"), &ta, None).await;
    assert_eq!(repli, fr);
    assert!(!fr.as_array().unwrap().is_empty(), "le seed fr existe");
    let (_, mine) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"title": "Idea", "description": "", "intensity": "soft", "locale": "en"})),
    )
    .await;
    let sid = mine["id"].as_str().unwrap().to_string();
    assert_eq!(mine["locale"], "en");
    let (_, en) = req(&app, "GET", &format!("{base}?lang=en"), &ta, None).await;
    assert_eq!(en.as_array().unwrap().len(), 1);
    assert_eq!(en[0]["done"], false);
    assert_eq!(en[0]["hidden"], false);

    // « fait » : un défi issu de la suggestion passe à jobDone (proposé par alice,
    // accepté puis validé par bob).
    let (_, ch) = req(&app, "POST", &format!("/api/spaces/{space}/challenges"), &ta,
        Some(json!({"title": "c", "description": "", "intensity": "soft", "sourceSuggestionId": sid}))).await;
    let cid = ch["id"].as_str().unwrap();
    for to in ["challengeAccepted", "jobDone"] {
        let (st, _) = req(
            &app,
            "POST",
            &format!("/api/spaces/{space}/challenges/{cid}/transitions"),
            &tb,
            Some(json!({"to": to})),
        )
        .await;
        assert_eq!(st, StatusCode::OK, "{to}");
    }
    let (_, en) = req(&app, "GET", &format!("{base}?lang=en"), &ta, None).await;
    assert_eq!(en[0]["done"], true);

    // Masquage : marche sur le seed GLOBAL comme sur une suggestion du salon, idempotent.
    let seed_id = fr[0]["id"].as_str().unwrap().to_string();
    for id in [&sid, &seed_id] {
        let url = format!("{base}/{id}/hidden");
        for _ in 0..2 {
            let (st, _) = req(&app, "PUT", &url, &tb, Some(json!({"hidden": true}))).await;
            assert_eq!(st, StatusCode::NO_CONTENT);
        }
    }
    let (_, en) = req(&app, "GET", &format!("{base}?lang=en"), &ta, None).await;
    assert_eq!(en[0]["hidden"], true);
    let (_, fr2) = req(&app, "GET", &format!("{base}?lang=fr"), &ta, None).await;
    assert_eq!(fr2[0]["hidden"], true);
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{base}/{sid}/hidden"),
        &ta,
        Some(json!({"hidden": false})),
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (_, en) = req(&app, "GET", &format!("{base}?lang=en"), &ta, None).await;
    assert_eq!(en[0]["hidden"], false);

    // Suggestion introuvable / non membre.
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{base}/{}/hidden", Uuid::new_v4()),
        &ta,
        Some(json!({"hidden": true})),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let tc = token_for(&state, seed_user(&pool, "carol").await);
    let (st, _) = req(
        &app,
        "PUT",
        &format!("{base}/{sid}/hidden"),
        &tc,
        Some(json!({"hidden": true})),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn suggestions_edition_et_suppression_reservees_au_createur(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let bob = seed_user(&pool, "bob").await;
    let space = seed_space(&pool, alice).await;
    add_member(&pool, bob, space).await;
    let (ta, tb) = (token_for(&state, alice), token_for(&state, bob));
    let base = format!("/api/spaces/{space}/suggestions");
    let (_, s) = req(
        &app,
        "POST",
        &base,
        &ta,
        Some(json!({"title": "À moi", "description": "", "intensity": "hot"})),
    )
    .await;
    let url = format!("{base}/{}", s["id"].as_str().unwrap());
    let upd = json!({"title": "Édité", "description": "d", "intensity": "soft"});

    // Bob (membre mais pas créateur) : 404, rien ne bouge (SEC-013).
    let (st, _) = req(&app, "PATCH", &url, &tb, Some(upd.clone())).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = req(&app, "DELETE", &url, &tb, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, e) = req(&app, "PATCH", &url, &ta, Some(upd)).await;
    assert_eq!((st, e["title"].as_str()), (StatusCode::OK, Some("Édité")));
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    let (st, _) = req(&app, "DELETE", &url, &ta, None).await; // déjà supprimée
    assert_eq!(st, StatusCode::NOT_FOUND);
}

// =====================================================================
// Auth : mode SSO seul, hash illisible, révocation, nom affiché
// =====================================================================

#[sqlx::test]
async fn auth_mot_de_passe_desactive_register_et_login_donnent_403(pool: PgPool) {
    let cfg = Config {
        password_auth_enabled: false,
        ..test_config()
    };
    let (app, _) = build_app_with(pool, cfg);
    let creds = json!({"email": "a@x.test", "displayName": "A", "password": "motdepasse-solide"});
    for path in ["/api/auth/register", "/api/auth/login"] {
        let (st, _) = req(&app, "POST", path, "", Some(creds.clone())).await;
        assert_eq!(st, StatusCode::FORBIDDEN, "{path}");
    }
}

#[sqlx::test]
async fn auth_hash_illisible_en_base_refuse_la_connexion(pool: PgPool) {
    let (app, _) = build_app_with(pool.clone(), test_config());
    // `seed_user` pose `password_hash = 'x'` : pas un hash Argon2 valide (corruption).
    seed_user(&pool, "alice").await;
    let (st, _) = req(
        &app,
        "POST",
        "/api/auth/login",
        "",
        Some(json!({"email": "alice@test.local", "password": "peu-importe-12"})),
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn auth_jeton_anterieur_a_la_revocation_refuse(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let t = token_for(&state, alice);
    let (st, _) = req(&app, "GET", "/api/auth/me", &t, None).await;
    assert_eq!(st, StatusCode::OK);
    // Borne de révocation dans le PASSÉ (déconnexion ancienne) : un jeton plus récent passe.
    sqlx::query("UPDATE users SET min_token_iat = now() - interval '1 hour' WHERE id = $1")
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    let (st, _) = req(&app, "GET", "/api/auth/me", &t, None).await;
    assert_eq!(st, StatusCode::OK);
    // Borne de révocation dans le futur : le jeton (émis avant) est rejeté (SEC-003).
    sqlx::query("UPDATE users SET min_token_iat = now() + interval '1 hour' WHERE id = $1")
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
    let (st, _) = req(&app, "GET", "/api/auth/me", &t, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn auth_changement_de_nom_borne_et_previent_les_salons(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, alice);

    let (st, _) = req(
        &app,
        "PATCH",
        "/api/auth/me",
        &t,
        Some(json!({"displayName": "x".repeat(81)})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let mut rx = state.events.subscribe();
    let (st, me) = req(
        &app,
        "PATCH",
        "/api/auth/me",
        &t,
        Some(json!({"displayName": " Alice B "})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(me["displayName"], "Alice B");
    // Chaque salon de l'utilisateur reçoit un event `space` (nom dénormalisé).
    let ev = rx.try_recv().expect("event émis");
    assert_eq!((ev.space_id, ev.actor_id), (space, alice));
    assert_eq!(serde_json::to_value(&ev).unwrap()["kind"], "space");
}

// =====================================================================
// Divers : humeur invalide, mot doux trop long, suppression de commentaire, notices
// =====================================================================

#[sqlx::test]
async fn humeur_invalide_refusee_et_libre_acceptee(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, alice);
    let url = format!("/api/spaces/{space}/moods/me");
    for bad in ["", "   ", &"x".repeat(41)] {
        let (st, _) = req(&app, "PUT", &url, &t, Some(json!({"status": bad}))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{bad:?}");
    }
    let (st, _) = req(&app, "PUT", &url, &t, Some(json!({"status": "😈 joueur"}))).await;
    assert_eq!(st, StatusCode::OK);
}

#[sqlx::test]
async fn mot_doux_trop_long_vide_ou_passe_refuses_ou_immediats(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, alice);
    let url = format!("/api/spaces/{space}/love-notes");
    for body in ["", "  ", &"é".repeat(2001)] {
        let (st, _) = req(&app, "POST", &url, &t, Some(json!({"body": body}))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST);
    }
    // 2000 caractères (multi-octets) : à la limite, accepté.
    let (st, _) = req(
        &app,
        "POST",
        &url,
        &t,
        Some(json!({"body": "é".repeat(2000)})),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED);
}

#[sqlx::test]
async fn suppression_de_commentaire_emet_un_event_comment(pool: PgPool) {
    let (app, state) = build_app_with(pool.clone(), test_config());
    let alice = seed_user(&pool, "alice").await;
    let space = seed_space(&pool, alice).await;
    let t = token_for(&state, alice);
    let post = create_post(&app, space, &t, "p").await;
    let base = format!("/api/spaces/{space}/posts/{post}/comments");
    let (_, c) = req(&app, "POST", &base, &t, Some(json!({"body": "x"}))).await;

    let mut rx = state.events.subscribe();
    let (st, _) = req(
        &app,
        "DELETE",
        &format!("{base}/{}", c["id"].as_str().unwrap()),
        &t,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NO_CONTENT);
    assert_eq!(
        serde_json::to_value(rx.try_recv().unwrap()).unwrap()["kind"],
        "comment"
    );
    let (st, _) = req(
        &app,
        "DELETE",
        &format!("{base}/{}", c["id"].as_str().unwrap()),
        &t,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn notice_en_echec_est_journalisee_sans_planter(pool: PgPool) {
    // Salon et acteur inexistants : la contrainte FK échoue, `record` avale l'erreur
    // (best-effort) — l'action appelante ne doit jamais échouer à cause d'une notice.
    crate::routes::notices::record(&pool, Uuid::new_v4(), "member_joined", Uuid::new_v4()).await;
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM space_notices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}
