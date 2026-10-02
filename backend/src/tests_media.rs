//! Tests d'intégration du pipeline média (backlog #92, suite) : upload (liste
//! blanche MIME, EXIF, dimensions, chiffrement au repos), lecture authentifiée
//! (200 / `Range` 206 / 416, `view_once` atomique), purge des orphelins et
//! sous-commandes de maintenance (`backfill_encryption`, `rotate_key`).
//!
//! Chaque test écrit dans son propre dossier temporaire (supprimé au Drop).
//! Même garde que `tests_integration` : feature `integration` + Postgres jetable.

use std::io::Cursor;
use std::path::PathBuf;

use axum::body::Body;
use axum::http::{header, HeaderMap, Request, StatusCode};
use axum::Router;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::config::Config;
use crate::routes::media::{backfill_encryption, decrypt, encrypt, purge_orphan_media, rotate_key};
use crate::state::AppState;
use crate::tests_integration::{
    add_member, build_app_with, create_post, seed_space, seed_user, test_config, token_for,
};

const KEY_A: [u8; 32] = [7; 32];
const KEY_B: [u8; 32] = [9; 32];
const CLEAR: &[u8] = b"0123456789abcdefghij"; // 20 octets reconnaissables

/// Dossier média jetable, supprimé à la fin du test.
struct Dir(PathBuf);
impl Dir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!("pp-media-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        Dir(p)
    }
    fn s(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
    fn file(&self, key: &str) -> PathBuf {
        self.0.join(key)
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn config(dir: &Dir, key: Option<[u8; 32]>) -> Config {
    Config {
        media_dir: dir.s(),
        media_key: key.map(|k| STANDARD.encode(k)).unwrap_or_default(),
        ..test_config()
    }
}

/// POST multipart ; `file` = (octets, content-type) ou None pour omettre le champ.
async fn upload(
    app: &Router,
    space: Uuid,
    token: &str,
    file: Option<(&[u8], &str)>,
    view_once: bool,
) -> (StatusCode, Value) {
    let b = "PinkBoundary";
    let mut body: Vec<u8> = Vec::new();
    if let Some((bytes, mime)) = file {
        body.extend_from_slice(
            format!(
                "--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x\"\r\n\
                 Content-Type: {mime}\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n");
    }
    // Champ inconnu : ignoré sans erreur.
    body.extend_from_slice(
        format!("--{b}\r\nContent-Disposition: form-data; name=\"inconnu\"\r\n\r\nvaleur\r\n").as_bytes(),
    );
    body.extend_from_slice(
        format!("--{b}\r\nContent-Disposition: form-data; name=\"viewOnce\"\r\n\r\n{view_once}\r\n--{b}--\r\n")
            .as_bytes(),
    );
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/spaces/{space}/media"))
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, format!("multipart/form-data; boundary={b}"))
                .header("x-real-ip", "127.0.0.1")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let st = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (st, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn upload_ok(app: &Router, space: Uuid, token: &str, bytes: &[u8], view_once: bool) -> Uuid {
    let (st, j) = upload(app, space, token, Some((bytes, "image/jpeg")), view_once).await;
    assert_eq!(st, StatusCode::CREATED, "{j}");
    Uuid::parse_str(j["id"].as_str().unwrap()).unwrap()
}

/// GET brut (statut, en-têtes, octets), `Range` optionnel.
async fn get(
    app: &Router,
    space: Uuid,
    media: Uuid,
    token: &str,
    range: Option<&str>,
) -> (StatusCode, HeaderMap, Vec<u8>) {
    let mut b = Request::builder()
        .method("GET")
        .uri(format!("/api/spaces/{space}/media/{media}"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header("x-real-ip", "127.0.0.1");
    if let Some(r) = range {
        b = b.header(header::RANGE, r);
    }
    let resp = app.clone().oneshot(b.body(Body::empty()).unwrap()).await.unwrap();
    let (st, h) = (resp.status(), resp.headers().clone());
    (st, h, resp.into_body().collect().await.unwrap().to_bytes().to_vec())
}

async fn row(pool: &PgPool, id: Uuid) -> (String, bool, Option<i32>, Option<i32>) {
    sqlx::query_as("SELECT storage_key, encrypted, width, height FROM media WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

fn hv<'a>(h: &'a HeaderMap, name: &str) -> &'a str {
    h.get(name).unwrap().to_str().unwrap()
}

struct Env {
    app: Router,
    state: AppState,
    dir: Dir,
    alice: Uuid,
    space: Uuid,
    ta: String,
}

async fn env(pool: &PgPool, key: Option<[u8; 32]>) -> Env {
    let dir = Dir::new();
    let (app, state) = build_app_with(pool.clone(), config(&dir, key));
    let alice = seed_user(pool, &format!("alice-{}", Uuid::new_v4().simple())).await;
    let space = seed_space(pool, alice).await;
    let ta = token_for(&state, alice);
    Env { app, state, dir, alice, space, ta }
}

// =====================================================================
// Upload
// =====================================================================

#[sqlx::test]
async fn upload_refuse_mime_hors_liste_blanche_champ_manquant_et_non_membre(pool: PgPool) {
    let e = env(&pool, None).await;
    // SVG (document XML actif) et type inconnu : refusés (SECURITY_FINDINGS.md #7).
    for mime in ["image/svg+xml", "application/pdf", "text/html"] {
        let (st, _) = upload(&e.app, e.space, &e.ta, Some((b"<svg/>", mime)), false).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{mime}");
    }
    let (st, _) = upload(&e.app, e.space, &e.ta, None, false).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // Non-membre.
    let mallory = token_for(&e.state, seed_user(&pool, "mallory").await);
    let (st, _) = upload(&e.app, e.space, &mallory, Some((CLEAR, "image/jpeg")), false).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Rien n'a été écrit ni enregistré.
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM media").fetch_one(&pool).await.unwrap();
    assert_eq!(n, 0);
    assert_eq!(std::fs::read_dir(&e.dir.0).unwrap().count(), 0);
}

#[sqlx::test]
async fn upload_png_enregistre_les_dimensions_et_stocke_en_clair_sans_cle(pool: PgPool) {
    let e = env(&pool, None).await;
    let mut png = Vec::new();
    image::RgbImage::new(3, 2)
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .unwrap();
    let (st, j) = upload(&e.app, e.space, &e.ta, Some((&png, "image/png")), false).await;
    assert_eq!(st, StatusCode::CREATED);
    assert_eq!(j["mime"], "image/png");
    assert_eq!(j["viewOnce"], false);
    let id = Uuid::parse_str(j["id"].as_str().unwrap()).unwrap();

    let (key, encrypted, w, h) = row(&pool, id).await;
    assert_eq!((encrypted, w, h), (false, Some(3), Some(2)));
    // Stocké sous un nom UUID, hors de tout dossier public ; octets lisibles tels quels.
    assert!(Uuid::parse_str(&key).is_ok());
    assert!(!std::fs::read(e.dir.file(&key)).unwrap().is_empty());
}

#[sqlx::test]
async fn upload_chiffre_au_repos_et_la_lecture_restitue_le_clair(pool: PgPool) {
    let e = env(&pool, Some(KEY_A)).await;
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let (key, encrypted, ..) = row(&pool, id).await;
    assert!(encrypted);

    // Sur disque : jamais le clair, mais un blob que SEULE la clé déchiffre.
    let on_disk = std::fs::read(e.dir.file(&key)).unwrap();
    assert!(!on_disk.windows(CLEAR.len()).any(|w| w == CLEAR));
    assert_eq!(decrypt(&KEY_A, &on_disk).unwrap(), CLEAR);
    assert!(decrypt(&KEY_B, &on_disk).is_none());

    let (st, h, body) = get(&e.app, e.space, id, &e.ta, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body, CLEAR);
    assert_eq!(hv(&h, "content-type"), "image/jpeg");
    assert_eq!(hv(&h, "content-length"), "20");
    assert_eq!(hv(&h, "cache-control"), "no-store");
    assert_eq!(hv(&h, "accept-ranges"), "bytes");
}

// =====================================================================
// Lecture : Range, autorisation, cas d'erreur
// =====================================================================

#[sqlx::test]
async fn lecture_en_clair_complete_et_par_plages(pool: PgPool) {
    let e = env(&pool, None).await;
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;

    let (st, h, body) = get(&e.app, e.space, id, &e.ta, None).await;
    assert_eq!((st, body.as_slice()), (StatusCode::OK, CLEAR));
    assert_eq!(hv(&h, "cache-control"), "no-store");

    for (spec, expected, range) in [
        ("bytes=2-5", &CLEAR[2..=5], "bytes 2-5/20"),
        ("bytes=15-", &CLEAR[15..], "bytes 15-19/20"),
        ("bytes=-3", &CLEAR[17..], "bytes 17-19/20"),
        ("bytes=0-999", CLEAR, "bytes 0-19/20"), // end borné à total-1
    ] {
        let (st, h, body) = get(&e.app, e.space, id, &e.ta, Some(spec)).await;
        assert_eq!(st, StatusCode::PARTIAL_CONTENT, "{spec}");
        assert_eq!(body, expected, "{spec}");
        assert_eq!(hv(&h, "content-range"), range);
        assert_eq!(hv(&h, "content-length"), expected.len().to_string());
    }

    // Hors du fichier → 416 avec `bytes */total`, et le média n'est pas consommé.
    let (st, h, _) = get(&e.app, e.space, id, &e.ta, Some("bytes=50-60")).await;
    assert_eq!(st, StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(hv(&h, "content-range"), "bytes */20");
}

#[sqlx::test]
async fn lecture_chiffree_par_plages_et_416(pool: PgPool) {
    let e = env(&pool, Some(KEY_A)).await;
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;

    let (st, h, body) = get(&e.app, e.space, id, &e.ta, Some("bytes=5-9")).await;
    assert_eq!(st, StatusCode::PARTIAL_CONTENT);
    assert_eq!(body, &CLEAR[5..=9]); // tranche du CLAIR, pas du chiffré
    assert_eq!(hv(&h, "content-range"), "bytes 5-9/20");
    assert_eq!(hv(&h, "cache-control"), "no-store");

    let (st, h, _) = get(&e.app, e.space, id, &e.ta, Some("bytes=99-")).await;
    assert_eq!(st, StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(hv(&h, "content-range"), "bytes */20");
}

#[sqlx::test]
async fn lecture_refuse_non_membre_et_cloisonne_les_salons(pool: PgPool) {
    let e = env(&pool, None).await;
    let bob = seed_user(&pool, "bob").await;
    let space_b = seed_space(&pool, bob).await;
    let tb = token_for(&e.state, bob);
    let mid = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;

    // Bob n'est pas membre du salon d'alice : 403.
    let (st, ..) = get(&e.app, e.space, mid, &tb, None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Bob vise le média d'alice depuis SON salon : 404, pas de fuite inter-salons.
    let (st, ..) = get(&e.app, space_b, mid, &tb, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Média inconnu.
    let (st, ..) = get(&e.app, e.space, Uuid::new_v4(), &e.ta, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Sans jeton du tout : 401.
    let resp = e
        .app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/spaces/{}/media/{mid}", e.space))
                .header("x-real-ip", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn lecture_fichier_absent_du_disque_donne_404(pool: PgPool) {
    let e = env(&pool, None).await;
    let plain = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let (key, ..) = row(&pool, plain).await;
    std::fs::remove_file(e.dir.file(&key)).unwrap();
    let (st, ..) = get(&e.app, e.space, plain, &e.ta, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, ..) = get(&e.app, e.space, plain, &e.ta, Some("bytes=0-3")).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Chemin « chiffré » : même comportement.
    let e2 = env(&pool, Some(KEY_A)).await;
    let enc = upload_ok(&e2.app, e2.space, &e2.ta, CLEAR, false).await;
    let (key, ..) = row(&pool, enc).await;
    std::fs::remove_file(e2.dir.file(&key)).unwrap();
    let (st, ..) = get(&e2.app, e2.space, enc, &e2.ta, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn lecture_chiffree_sans_cle_ou_avec_mauvaise_cle_donne_500_sans_fuite(pool: PgPool) {
    let e = env(&pool, Some(KEY_A)).await;
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;

    // MEDIA_KEY retirée de la config : on ne sert JAMAIS le blob chiffré brut.
    let (app_sans, state_sans) = build_app_with(pool.clone(), config(&e.dir, None));
    let t = token_for(&state_sans, e.alice);
    let (st, _, body) = get(&app_sans, e.space, id, &t, None).await;
    assert_eq!(st, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(!String::from_utf8_lossy(&body).contains("key"));

    // MEDIA_KEY changée : déchiffrement refusé, erreur opaque.
    let (app_b, state_b) = build_app_with(pool.clone(), config(&e.dir, Some(KEY_B)));
    let t = token_for(&state_b, e.alice);
    let (st, _, body) = get(&app_b, e.space, id, &t, None).await;
    assert_eq!(st, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(body.windows(CLEAR.len()).all(|w| w != CLEAR));
}

// =====================================================================
// view_once
// =====================================================================

#[sqlx::test]
async fn view_once_range_consomme_et_supprime_le_fichier(pool: PgPool) {
    for key in [None, Some(KEY_A)] {
        let e = env(&pool, key).await;
        let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, true).await;
        let (storage, ..) = row(&pool, id).await;
        assert!(e.dir.file(&storage).exists());

        // Une lecture partielle suffit à consommer le média éphémère.
        let (st, _, body) = get(&e.app, e.space, id, &e.ta, Some("bytes=0-3")).await;
        assert_eq!((st, body.as_slice()), (StatusCode::PARTIAL_CONTENT, &CLEAR[..4]));
        assert!(!e.dir.file(&storage).exists(), "fichier supprimé après lecture");
        let consumed: bool = sqlx::query_scalar("SELECT consumed FROM media WHERE id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(consumed);

        let (st, ..) = get(&e.app, e.space, id, &e.ta, None).await;
        assert_eq!(st, StatusCode::NOT_FOUND);
    }
}

#[sqlx::test]
async fn view_once_lectures_concurrentes_une_seule_gagne(pool: PgPool) {
    let e = env(&pool, None).await;
    let bob = seed_user(&pool, "bob").await;
    add_member(&pool, bob, e.space).await;
    let tb = token_for(&e.state, bob);
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, true).await;

    // SEC-004 : le claim atomique `consumed false→true` ne laisse passer qu'UNE
    // requête, même lancées exactement en même temps.
    let (a, b, c) = tokio::join!(
        get(&e.app, e.space, id, &e.ta, None),
        get(&e.app, e.space, id, &tb, None),
        get(&e.app, e.space, id, &tb, None),
    );
    let statuts = [a.0, b.0, c.0];
    assert_eq!(statuts.iter().filter(|s| **s == StatusCode::OK).count(), 1, "{statuts:?}");
    assert_eq!(statuts.iter().filter(|s| **s == StatusCode::NOT_FOUND).count(), 2);
}

// =====================================================================
// Purge des orphelins
// =====================================================================

#[sqlx::test]
async fn purge_orphelins_supprime_les_vieux_non_rattaches_seulement(pool: PgPool) {
    let e = env(&pool, None).await;
    let post = create_post(&e.app, e.space, &e.ta, "avec média").await;

    let vieux_orphelin = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let vieux_attache = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let recent_orphelin = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    sqlx::query("INSERT INTO post_media (post_id, media_id, position) VALUES ($1, $2, 0)")
        .bind(post)
        .bind(vieux_attache)
        .execute(&pool)
        .await
        .unwrap();
    for id in [vieux_orphelin, vieux_attache] {
        sqlx::query("UPDATE media SET created_at = now() - interval '2 hours' WHERE id = $1")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
    }
    let (k_orphelin, ..) = row(&pool, vieux_orphelin).await;
    let (k_attache, ..) = row(&pool, vieux_attache).await;
    let (k_recent, ..) = row(&pool, recent_orphelin).await;

    purge_orphan_media(&pool, &e.dir.s()).await;

    let ids: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM media ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(!ids.contains(&vieux_orphelin));
    assert!(ids.contains(&vieux_attache) && ids.contains(&recent_orphelin));
    assert!(!e.dir.file(&k_orphelin).exists(), "fichier orphelin supprimé");
    assert!(e.dir.file(&k_attache).exists() && e.dir.file(&k_recent).exists());

    // Idempotent.
    purge_orphan_media(&pool, &e.dir.s()).await;
}

// =====================================================================
// Maintenance : backfill_encryption / rotate_key
// =====================================================================

#[sqlx::test]
async fn backfill_chiffre_les_medias_en_clair_et_est_reexecutable(pool: PgPool) {
    // Médias uploadés SANS clé (en clair), puis migrés.
    let e = env(&pool, None).await;
    let a = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let b = upload_ok(&e.app, e.space, &e.ta, b"autre contenu", false).await;
    let absent = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let (k_absent, ..) = row(&pool, absent).await;
    std::fs::remove_file(e.dir.file(&k_absent)).unwrap(); // fichier manquant : ignoré
    let (old_a, ..) = row(&pool, a).await;

    backfill_encryption(&pool, &e.dir.s(), &KEY_A).await.unwrap();

    let (new_a, enc_a, ..) = row(&pool, a).await;
    assert!(enc_a);
    assert_ne!(new_a, old_a, "nouveau storage_key");
    assert!(!e.dir.file(&old_a).exists(), "ancien fichier en clair supprimé");
    assert_eq!(decrypt(&KEY_A, &std::fs::read(e.dir.file(&new_a)).unwrap()).unwrap(), CLEAR);
    assert!(row(&pool, b).await.1);
    let (k, enc_absent, ..) = row(&pool, absent).await;
    assert!(!enc_absent && k == k_absent, "ligne au fichier absent inchangée");

    // Servi en clair via l'API avec la clé configurée.
    let (app, state) = build_app_with(pool.clone(), config(&e.dir, Some(KEY_A)));
    let (st, _, body) = get(&app, e.space, a, &token_for(&state, e.alice), None).await;
    assert_eq!((st, body.as_slice()), (StatusCode::OK, CLEAR));

    // Ré-exécution : plus rien d'éligible (sauf l'absent), aucun double chiffrement.
    let avant = row(&pool, a).await.0;
    backfill_encryption(&pool, &e.dir.s(), &KEY_A).await.unwrap();
    assert_eq!(row(&pool, a).await.0, avant);

    // Base entièrement chiffrée : sortie immédiate.
    sqlx::query("DELETE FROM media WHERE id = $1").bind(absent).execute(&pool).await.unwrap();
    backfill_encryption(&pool, &e.dir.s(), &KEY_A).await.unwrap();
}

#[sqlx::test]
async fn rotation_de_cle_migre_ignore_les_deja_migres_et_refuse_les_mauvaises_cles(pool: PgPool) {
    let e = env(&pool, Some(KEY_A)).await;
    let chiffre = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    // Un média encore en clair rejoint la rotation et se retrouve chiffré (clé B).
    let (app_clair, state_clair) = build_app_with(pool.clone(), config(&e.dir, None));
    let clair = upload_ok(&app_clair, e.space, &token_for(&state_clair, e.alice), b"en clair", false).await;
    let (old_chiffre, ..) = row(&pool, chiffre).await;

    rotate_key(&pool, &e.dir.s(), &KEY_A, &KEY_B).await.unwrap();

    let (new_chiffre, enc, ..) = row(&pool, chiffre).await;
    assert!(enc);
    assert_ne!(new_chiffre, old_chiffre);
    assert!(!e.dir.file(&old_chiffre).exists());
    let blob = std::fs::read(e.dir.file(&new_chiffre)).unwrap();
    assert!(decrypt(&KEY_A, &blob).is_none(), "l'ancienne clé ne marche plus");
    assert_eq!(decrypt(&KEY_B, &blob).unwrap(), CLEAR);
    let (k_clair, enc_clair, ..) = row(&pool, clair).await;
    assert!(enc_clair);
    assert_eq!(decrypt(&KEY_B, &std::fs::read(e.dir.file(&k_clair)).unwrap()).unwrap(), b"en clair");

    // L'API configurée avec la NOUVELLE clé sert bien le clair.
    let (app_b, state_b) = build_app_with(pool.clone(), config(&e.dir, Some(KEY_B)));
    let (st, _, body) = get(&app_b, e.space, chiffre, &token_for(&state_b, e.alice), None).await;
    assert_eq!((st, body.as_slice()), (StatusCode::OK, CLEAR));

    // Ré-exécution (A→B) : médias déjà migrés détectés et ignorés, rien ne change.
    rotate_key(&pool, &e.dir.s(), &KEY_A, &KEY_B).await.unwrap();
    assert_eq!(row(&pool, chiffre).await.0, new_chiffre);

    // Ni l'ancienne ni la nouvelle clé : échec franc (clé erronée), rien d'écrasé.
    let err = rotate_key(&pool, &e.dir.s(), &[1; 32], &[2; 32]).await.unwrap_err();
    assert!(err.to_string().contains("ne déchiffre ni"));
    assert_eq!(row(&pool, chiffre).await.0, new_chiffre);
}

#[sqlx::test]
async fn rotation_sans_media_et_fichier_absent_ne_plante_pas(pool: PgPool) {
    let e = env(&pool, Some(KEY_A)).await;
    rotate_key(&pool, &e.dir.s(), &KEY_A, &KEY_B).await.unwrap(); // aucun média
    backfill_encryption(&pool, &e.dir.s(), &KEY_A).await.unwrap(); // aucun média

    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;
    let (k, ..) = row(&pool, id).await;
    std::fs::remove_file(e.dir.file(&k)).unwrap();
    rotate_key(&pool, &e.dir.s(), &KEY_A, &KEY_B).await.unwrap(); // fichier absent : ignoré
    assert_eq!(row(&pool, id).await.0, k);

    // chiffrer/déchiffrer : aller-retour direct.
    let blob = encrypt(&KEY_A, CLEAR).unwrap();
    assert_eq!(decrypt(&KEY_A, &blob).unwrap(), CLEAR);
    let _ = json!({});
}

#[sqlx::test]
async fn upload_jpeg_nettoye_les_metadonnees_et_garde_les_dimensions(pool: PgPool) {
    let e = env(&pool, None).await;
    let mut jpeg = Vec::new();
    image::RgbImage::new(4, 3)
        .write_to(&mut Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
        .unwrap();
    let (st, j) = upload(&e.app, e.space, &e.ta, Some((&jpeg, "image/jpeg")), false).await;
    assert_eq!(st, StatusCode::CREATED);
    let id = Uuid::parse_str(j["id"].as_str().unwrap()).unwrap();
    let (key, _, w, h) = row(&pool, id).await;
    assert_eq!((w, h), (Some(4), Some(3)));
    // Le fichier stocké reste un JPEG valide après réécriture des métadonnées.
    let stored = std::fs::read(e.dir.file(&key)).unwrap();
    assert_eq!(&stored[..2], &[0xFF, 0xD8]);
    assert!(image::load_from_memory(&stored).is_ok());
}

#[sqlx::test]
async fn lecture_plages_mal_formees_ou_multiples(pool: PgPool) {
    let e = env(&pool, None).await;
    let id = upload_ok(&e.app, e.space, &e.ta, CLEAR, false).await;

    // Plages multiples : non gérées ⇒ ressource entière (200 valide).
    let (st, _, body) = get(&e.app, e.space, id, &e.ta, Some("bytes=0-1,5-6")).await;
    assert_eq!((st, body.as_slice()), (StatusCode::OK, CLEAR));
    // Unité inconnue, bornes non numériques, début au-delà de la fin : 416.
    for spec in ["items=0-1", "bytes=abc-", "bytes=0-xyz", "bytes=10-5", "bytes=-0"] {
        let (st, ..) = get(&e.app, e.space, id, &e.ta, Some(spec)).await;
        assert_eq!(st, StatusCode::RANGE_NOT_SATISFIABLE, "{spec}");
    }
}
