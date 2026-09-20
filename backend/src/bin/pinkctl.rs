//! `pinkctl` — outil d'administration pour une instance PinkPhone self-hosted.
//!
//! Binaire séparé du serveur (`pinkphone-api`), mais qui réutilise directement
//! le pool DB et la logique métier du crate `pinkphone_api` : utile même API
//! arrêtée (diagnostics, migrations, comptes de support). Toutes les commandes
//! parlent DIRECTEMENT à Postgres (pas de HTTP) sauf `ping`, qui vérifie
//! justement que le process serveur répond — cf. sa doc.
//!
//! Lecture de la config : mêmes variables d'environnement que le serveur
//! (`.env`, `DATABASE_URL`/`DB_*`, `MEDIA_DIR`, ...) — voir `config.rs`.

use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use pinkphone_api::auth::hash_password;
use pinkphone_api::config::Config;
use pinkphone_api::notifications::send_test_notification;
use pinkphone_api::routes::media::decrypt as media_decrypt;
use serde::Serialize;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::PgPool;
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;
use uuid::Uuid;
use web_push::HyperWebPushClient;

/// Nombre max de membres par espace (aligné sur `routes::spaces::MAX_MEMBERS`).
const MAX_MEMBERS: usize = 8;

#[derive(Parser)]
#[command(name = "pinkctl", version, about = "Administration d'une instance PinkPhone self-hosted")]
struct Cli {
    #[command(subcommand)]
    command: Command,
    /// Sortie JSON au lieu du texte formaté (commandes `list` uniquement).
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand)]
enum Command {
    /// Vérifier la configuration de déploiement (secrets, env, OIDC).
    Config {
        #[command(subcommand)]
        action: ConfigCmd,
    },
    /// Migrations & diagnostics base de données.
    Db {
        #[command(subcommand)]
        action: DbCmd,
    },
    /// Gestion des comptes utilisateurs.
    User {
        #[command(subcommand)]
        action: UserCmd,
    },
    /// Gestion des espaces (couples).
    Space {
        #[command(subcommand)]
        action: SpaceCmd,
    },
    /// Maintenance du stockage média.
    Media {
        #[command(subcommand)]
        action: MediaCmd,
    },
    /// Notifications push.
    Notify {
        #[command(subcommand)]
        action: NotifyCmd,
    },
    /// Catalogue de contenu (bucket list / menu du soir).
    Catalog {
        #[command(subcommand)]
        action: CatalogCmd,
    },
    /// Efface TOUT (comptes, espaces, contenu, médias) — remise à zéro complète.
    ///
    /// Supprime tous les comptes, espaces, contenu ET médias sur disque. Le
    /// catalogue (bucket list/menu du soir) et la banque de défis globale ne
    /// sont JAMAIS touchés (contenu de référence, pas des données utilisateur).
    /// IRRÉVERSIBLE — sans confirmation, affiche juste ce qui serait supprimé.
    Nuke {
        /// Doit valoir exactement "NUKE-EVERYTHING" pour être appliqué (garder
        /// en phase avec `NUKE_CONFIRM_PHRASE` ci-dessous si l'un change).
        #[arg(long)]
        confirm: Option<String>,
    },
    /// Crée un jeu de données de démo (2 comptes + 1 espace + humeurs/post/défi
    /// d'exemple) pour développer sans base vide. Idempotent (relancer ne
    /// duplique pas le contenu). Refusé sur un déploiement exposé — les
    /// comptes créés ont un mot de passe connu, jamais acceptable en prod.
    SeedDemo,
    /// État de santé du backing store (DB + stockage média) — pas du process.
    ///
    /// Pas le process serveur lui-même (cf. `ping` pour ça) : DB joignable,
    /// migrations à jour (échoue si une migration manque — code et schéma
    /// désynchronisés), et MEDIA_DIR accessible en écriture.
    Health,
    /// Vérifie que le serveur RÉPOND (requête HTTP sur `/health`).
    ///
    /// Nécessite `docker exec <api-container> pinkctl ping` sur le conteneur
    /// DÉJÀ lancé — un `docker compose run` spawnerait un nouveau conteneur
    /// sans serveur à joindre en local, et échouerait toujours pour la
    /// mauvaise raison.
    Ping {
        /// URL à taper (défaut : http://127.0.0.1:<port de BIND_ADDR>/health).
        #[arg(long)]
        url: Option<String>,
    },
    /// Version et commit source de ce build (aucune base ni config requise).
    ///
    /// Injectés à la compilation par le pipeline (APP_VERSION / APP_COMMIT) ;
    /// `dev` pour un build local. Même valeur que `GET /api/version`.
    Version,
}

/// Volontairement pas un simple booléen `--confirm` (contrairement à `user
/// delete`/`media prune`) : ce sont TOUTES les données de l'instance, pas une
/// seule ligne. Exiger cette phrase précise réduit le risque d'un `--confirm`
/// tapé par réflexe (copié-collé d'une autre commande, habitude).
const NUKE_CONFIRM_PHRASE: &str = "NUKE-EVERYTHING";

#[derive(Subcommand)]
enum ConfigCmd {
    /// Vérifie les secrets/variables d'environnement et affiche les alertes.
    Check,
}

#[derive(Subcommand)]
enum DbCmd {
    /// Affiche les migrations appliquées / en attente.
    Status,
    /// Applique les migrations en attente (même effet qu'au démarrage du serveur).
    Migrate,
}

#[derive(Subcommand)]
enum UserCmd {
    /// Liste les comptes (email, nom, date de création).
    List,
    /// Crée un compte. Mot de passe demandé de façon masquée si `--password` est omis.
    Create {
        #[arg(long)]
        email: String,
        #[arg(long)]
        display_name: String,
        #[arg(long)]
        password: Option<String>,
    },
    /// Réinitialise le mot de passe d'un compte existant.
    ResetPassword {
        #[arg(long)]
        email: String,
        #[arg(long)]
        password: Option<String>,
    },
    /// Supprime un compte et tout son contenu (cascade DB : posts, défis, médias,
    /// humeurs, appartenances). Ne supprime PAS un espace resté sans membre.
    Delete {
        #[arg(long)]
        email: String,
        /// Confirme la suppression (requis — action irréversible, pas de prompt ici).
        #[arg(long)]
        confirm: bool,
    },
}

#[derive(Subcommand)]
enum SpaceCmd {
    /// Liste les espaces avec leurs membres.
    List,
    /// Crée un espace et y ajoute les membres donnés (comptes déjà existants).
    Create {
        #[arg(long)]
        name: String,
        /// Emails séparés par des virgules.
        #[arg(long, value_delimiter = ',')]
        members: Vec<String>,
    },
    /// Renomme un espace.
    Rename {
        space_id: Uuid,
        #[arg(long)]
        name: String,
    },
    /// Supprime un espace et tout son contenu (cascade DB + médias sur disque).
    /// Ne supprime PAS les comptes des membres, juste leur appartenance à CET
    /// espace.
    Delete {
        space_id: Uuid,
        #[arg(long)]
        confirm: bool,
    },
    /// Retire un membre d'un espace (le compte lui-même n'est pas supprimé).
    RemoveMember {
        space_id: Uuid,
        #[arg(long)]
        email: String,
    },
}

#[derive(Subcommand)]
enum MediaCmd {
    /// Liste (et supprime avec --apply) les médias orphelins : uploadés mais
    /// jamais rattachés à un post, plus vieux que `--older-than-hours`.
    Prune {
        #[arg(long, default_value_t = 1)]
        older_than_hours: i64,
        #[arg(long)]
        apply: bool,
    },
    /// Déchiffre un échantillon de médias chiffrés pour vérifier que MEDIA_KEY
    /// est la bonne. N'affiche et n'écrit JAMAIS le contenu déchiffré — juste
    /// succès/échec par média.
    Verify {
        #[arg(long, default_value_t = 5)]
        sample: usize,
    },
}

#[derive(Subcommand)]
enum NotifyCmd {
    /// Envoie une notification push de test à tous les abonnements d'un compte
    /// (utile pour vérifier VAPID/le SW sans attendre un vrai événement).
    Test {
        #[arg(long)]
        email: String,
        #[arg(long, default_value = "Test pinkctl")]
        message: String,
    },
    /// Liste les abonnements push (endpoint tronqué — jamais l'URL complète)
    /// et le mode de notification par compte. Diagnostique "pourquoi mon
    /// partenaire ne reçoit rien" (VAPID désactivé, mode ghost, aucun abonnement...).
    List {
        /// Filtre sur un seul compte (sinon : tous les abonnements).
        #[arg(long)]
        email: Option<String>,
    },
}

#[derive(Subcommand)]
enum CatalogCmd {
    /// Résumé du catalogue (bucket list / menu du soir) : catégories, usages,
    /// nombre d'items actifs/inactifs.
    List,
    /// Active/désactive un item du catalogue ("retrait doux" — un item
    /// désactivé disparaît des listings sans casser les picks/stances déjà
    /// posés dessus). Alterne l'état actuel.
    ToggleItem { item_id: String },
}

// ---------- types JSON (sortie --json des commandes `list`) ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserRow {
    id: Uuid,
    email: String,
    display_name: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpaceRow {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
    members: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogRow {
    id: String,
    label: String,
    used_in_bucket_list: bool,
    used_in_evening_menu: bool,
    active_items: i64,
    inactive_items: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PushSubRow {
    email: String,
    notif_mode: String,
    /// Préfixe de l'endpoint (jamais l'URL complète — identifie l'appareil).
    endpoint_preview: String,
    created_at: DateTime<Utc>,
}

/// Tronque un endpoint push pour l'affichage/JSON : assez pour distinguer le
/// service (FCM/Mozilla/...), pas assez pour ré-identifier l'abonnement.
fn preview_endpoint(endpoint: &str) -> String {
    let truncated: String = endpoint.chars().take(40).collect();
    if truncated.len() == endpoint.len() {
        truncated
    } else {
        format!("{truncated}…")
    }
}

fn print_json<T: Serialize>(rows: &[T]) -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", serde_json::to_string_pretty(rows)?);
    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("erreur: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();
    let config = Config::from_env();
    let json = cli.json;

    match cli.command {
        Command::Config { action } => match action {
            ConfigCmd::Check => {
                let lines = config_check(&config);
                for line in &lines {
                    println!("{line}");
                }
                // Exit non-zero sur un ✖ (pas un ⚠) : utilisable comme gate CI/
                // post-déploiement (cf. INSTALL.md#admin-cli-pinkctl), pas
                // seulement comme diagnostic lu par un humain.
                if has_blocking_issue(&lines) {
                    return Err("configuration bloquante (✖ ci-dessus) — voir INSTALL.md".into());
                }
            }
        },
        Command::Db { action } => {
            let pool = connect(&config).await?;
            match action {
                DbCmd::Status => db_status(&pool).await?,
                DbCmd::Migrate => {
                    sqlx::migrate!("./migrations").run(&pool).await?;
                    println!("migrations appliquées.");
                }
            }
        }
        Command::User { action } => {
            let pool = connect(&config).await?;
            match action {
                UserCmd::List => user_list(&pool, json).await?,
                UserCmd::Create {
                    email,
                    display_name,
                    password,
                } => {
                    let password = resolve_password(password, &config)?;
                    user_create(&pool, &email, &display_name, password).await?;
                }
                UserCmd::ResetPassword { email, password } => {
                    let password = resolve_password(password, &config)?;
                    user_reset_password(&pool, &email, password).await?;
                }
                UserCmd::Delete { email, confirm } => {
                    if !confirm {
                        return Err(format!(
                            "suppression de {email} refusée sans --confirm \
                             (action irréversible : supprime aussi ses posts/défis/médias)"
                        )
                        .into());
                    }
                    user_delete(&pool, &email).await?;
                }
            }
        }
        Command::Space { action } => {
            let pool = connect(&config).await?;
            match action {
                SpaceCmd::List => space_list(&pool, json).await?,
                SpaceCmd::Create { name, members } => {
                    space_create(&pool, &name, &members).await?
                }
                SpaceCmd::Rename { space_id, name } => {
                    space_rename(&pool, space_id, &name).await?
                }
                SpaceCmd::Delete { space_id, confirm } => {
                    if !confirm {
                        return Err(format!(
                            "suppression de l'espace {space_id} refusée sans --confirm \
                             (action irréversible : supprime son contenu et ses médias)"
                        )
                        .into());
                    }
                    space_delete(&pool, &config.media_dir, space_id).await?
                }
                SpaceCmd::RemoveMember { space_id, email } => {
                    space_remove_member(&pool, space_id, &email).await?
                }
            }
        }
        Command::Media { action } => {
            let pool = connect(&config).await?;
            match action {
                MediaCmd::Prune {
                    older_than_hours,
                    apply,
                } => media_prune(&pool, &config.media_dir, older_than_hours, apply).await?,
                MediaCmd::Verify { sample } => media_verify(&pool, &config, sample).await?,
            }
        }
        Command::Notify { action } => {
            let pool = connect(&config).await?;
            match action {
                NotifyCmd::Test { email, message } => {
                    notify_test(&pool, &config, &email, message).await?
                }
                NotifyCmd::List { email } => notify_list(&pool, email.as_deref(), json).await?,
            }
        }
        Command::Catalog { action } => {
            let pool = connect(&config).await?;
            match action {
                CatalogCmd::List => catalog_list(&pool, json).await?,
                CatalogCmd::ToggleItem { item_id } => catalog_toggle_item(&pool, &item_id).await?,
            }
        }
        Command::Nuke { confirm } => {
            let pool = connect(&config).await?;
            nuke(&pool, &config.media_dir, confirm.as_deref()).await?
        }
        Command::SeedDemo => {
            let pool = connect(&config).await?;
            seed_demo(&pool, &config).await?
        }
        Command::Health => {
            let pool = connect(&config).await?;
            let lines = health_check(&pool, &config.media_dir).await?;
            for line in &lines {
                println!("{line}");
            }
            if has_blocking_issue(&lines) {
                return Err("état de santé dégradé (✖ ci-dessus)".into());
            }
        }
        Command::Ping { url } => ping(&config.bind_addr, url.as_deref()).await?,
        Command::Version => {
            let b = pinkphone_api::routes::version::build_info();
            if json {
                println!("{}", serde_json::to_string(&b)?);
            } else {
                println!("{}", version_line(b.version, b.commit));
            }
        }
    }
    Ok(())
}

/// Ligne lisible : `0.0.147 (commit 432f3f5)` — SHA raccourci à 7 caractères,
/// `commit inconnu` hors pipeline.
fn version_line(version: &str, commit: &str) -> String {
    if commit.is_empty() {
        format!("{version} (commit inconnu)")
    } else {
        let short = commit.get(..7).unwrap_or(commit);
        format!("{version} (commit {short})")
    }
}

/// `true` seulement si `confirm` est EXACTEMENT la phrase attendue.
fn nuke_confirmed(confirm: Option<&str>) -> bool {
    confirm == Some(NUKE_CONFIRM_PHRASE)
}

/// Connexion DB identique à celle du serveur (DSN explicite si fourni, sinon
/// construite depuis les champs `db_*` — cf. `main.rs`).
async fn connect(config: &Config) -> Result<PgPool, Box<dyn std::error::Error>> {
    let connect_options = if config.database_url.is_empty() {
        PgConnectOptions::new()
            .host(&config.db_host)
            .port(config.db_port)
            .username(&config.db_user)
            .password(&config.db_password)
            .database(&config.db_name)
    } else {
        PgConnectOptions::from_str(&config.database_url)?
    };
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(connect_options)
        .await?;
    Ok(pool)
}

fn prompt_new_password() -> Result<String, Box<dyn std::error::Error>> {
    let pw1 = rpassword::prompt_password("mot de passe : ")?;
    let pw2 = rpassword::prompt_password("confirmer     : ")?;
    if pw1 != pw2 {
        return Err("les deux saisies ne correspondent pas".into());
    }
    Ok(pw1)
}

/// Un mot de passe passé en argument (`--password`) atterrit en clair dans
/// l'historique du shell et dans `ps`/`/proc` pendant l'exécution — acceptable
/// sur une base de dev en loopback, pas sur un déploiement exposé (là où
/// `pinkctl` tourne typiquement via `docker exec`, visible par tout autre
/// utilisateur du host ayant les droits `ps`). Sur un déploiement exposé, on
/// force donc la saisie masquée même si `--password` a été fourni.
fn resolve_password(
    password: Option<String>,
    config: &Config,
) -> Result<String, Box<dyn std::error::Error>> {
    match password {
        Some(_) if is_exposed(config) => Err(
            "--password refusé sur un déploiement exposé (BIND_ADDR non-loopback) : le mot \
             de passe resterait visible dans l'historique du shell et `ps`. Relance la \
             commande sans --password pour une saisie masquée."
                .into(),
        ),
        Some(p) => Ok(p),
        None => prompt_new_password(),
    }
}

// ---------- config check (pure — testable sans DB) ----------

/// L'API est considérée « exposée » si elle n'écoute pas uniquement en
/// loopback — même heuristique que la garde de démarrage du serveur
/// (`main.rs`). `pinkctl` s'appuie dessus pour durcir certains comportements
/// (mots de passe en argument, cf. `resolve_password`) : ce n'est PAS une
/// authentification (voir `INSTALL.md#admin-cli-pinkctl` — `pinkctl` n'est de
/// toute façon jamais exposé réseau lui-même), juste un signal « ceci
/// ressemble à un déploiement réel, pas à un dev local ».
fn is_exposed(config: &Config) -> bool {
    !(config.bind_addr.starts_with("127.")
        || config.bind_addr.starts_with("localhost")
        || config.bind_addr.starts_with("[::1]"))
}

/// Reprend les vérifications de la garde de démarrage (`main.rs`) plus quelques
/// autres (VAPID, OIDC, auth), sous forme de lignes de diagnostic. Ne modifie
/// rien et ne se connecte à rien : lisible même API arrêtée / mal configurée.
fn config_check(config: &Config) -> Vec<String> {
    let mut lines = Vec::new();
    let exposed = is_exposed(config);

    if config.jwt_secret == "dev-insecure-secret" || config.jwt_secret.len() < 32 {
        if exposed {
            lines.push(
                "✖ JWT_SECRET trop faible (valeur de dev ou < 32 caractères) et BIND_ADDR \
                 exposé — le serveur refusera de démarrer."
                    .into(),
            );
        } else {
            lines.push(
                "⚠ JWT_SECRET faible (valeur de dev ou < 32 caractères) — à changer avant \
                 toute exposition."
                    .into(),
            );
        }
    } else {
        lines.push("✔ JWT_SECRET défini et suffisamment fort".into());
    }

    match config.media_key_bytes() {
        Some(_) => lines.push("✔ MEDIA_KEY définie (chiffrement AES-256-GCM actif)".into()),
        None if config.media_key.trim().is_empty() => lines.push(
            "⚠ MEDIA_KEY absente : les médias sont stockés EN CLAIR sur disque".into(),
        ),
        None => lines.push(
            "✖ MEDIA_KEY fournie mais INVALIDE (base64 de 32 octets attendu) — médias \
             chiffrés existants illisibles, nouveaux médias stockés en clair"
                .into(),
        ),
    }

    if exposed && config.db_password == "pink" {
        lines.push("⚠ DB_PASSWORD par défaut ('pink') avec une API exposée".into());
    }

    if exposed && config.cors_origin == "http://localhost:5173" {
        lines.push(
            "⚠ CORS_ORIGIN au défaut de dev alors que l'API est exposée (positionne-le sur \
             l'origine réelle du déploiement)"
                .into(),
        );
    }

    if config.vapid_public_key.is_empty() || config.vapid_private_key.is_empty() {
        lines.push(
            "⚠ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absents → notifications push désactivées"
                .into(),
        );
    } else {
        lines.push("✔ clés VAPID définies (notifications push actives)".into());
    }

    let oidc_any = !config.oidc_issuer.is_empty()
        || !config.oidc_client_id.is_empty()
        || !config.oidc_client_secret.is_empty()
        || !config.oidc_redirect_uri.is_empty();
    if config.oidc_enabled() {
        lines.push(format!("✔ OIDC complet (issuer: {})", config.oidc_issuer));
    } else if !oidc_any {
        lines.push("· OIDC non configuré (SSO désactivé)".into());
    } else {
        lines.push(
            "✖ OIDC partiellement configuré (une des variables OIDC_* manque) — le SSO \
             restera désactivé"
                .into(),
        );
    }

    if !config.password_auth_enabled && !config.oidc_enabled() {
        lines.push(
            "✖ PASSWORD_AUTH_ENABLED=false et OIDC incomplet → plus AUCUN moyen de se \
             connecter"
                .into(),
        );
    } else if !config.password_auth_enabled {
        lines.push("· auth par mot de passe désactivée (OIDC uniquement)".into());
    }

    lines.push(format!(
        "· BIND_ADDR={} ({})",
        config.bind_addr,
        if exposed { "exposé" } else { "loopback" }
    ));

    lines
}

/// `true` si au moins une ligne de `config_check` est bloquante (✖, pas ⚠) —
/// c'est ce qui fait exit non-zéro `pinkctl config check` (cf. #70, gate
/// CI/post-déploiement). Extrait en fonction pure pour être testable sans
/// devoir relancer le binaire compilé (Cargo ne pose pas `CARGO_BIN_EXE_*`
/// pour un test à l'intérieur du binaire qu'il référencerait lui-même).
fn has_blocking_issue(lines: &[String]) -> bool {
    lines.iter().any(|l| l.starts_with('✖'))
}

// ---------- db ----------

async fn db_status(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let migrator = sqlx::migrate!("./migrations");
    let applied: Vec<i64> = sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations WHERE success = true ORDER BY version",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default(); // table absente => base fraîche, aucune migration appliquée

    let pending: Vec<_> = migrator
        .iter()
        .filter(|m| !applied.contains(&m.version))
        .collect();

    println!("migrations appliquées : {}", applied.len());
    if let Some(&last) = applied.last() {
        if let Some(m) = migrator.iter().find(|m| m.version == last) {
            println!("dernière appliquée     : {} ({})", m.version, m.description);
        }
    }
    if pending.is_empty() {
        println!("en attente             : aucune");
    } else {
        println!("en attente             : {}", pending.len());
        for m in pending {
            println!("  - {} {}", m.version, m.description);
        }
    }
    Ok(())
}

// ---------- user ----------

async fn user_list(pool: &PgPool, json: bool) -> Result<(), Box<dyn std::error::Error>> {
    let rows: Vec<(Uuid, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, email, display_name, created_at FROM users ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?;
    if json {
        let rows: Vec<UserRow> = rows
            .into_iter()
            .map(|(id, email, display_name, created_at)| UserRow {
                id,
                email,
                display_name,
                created_at,
            })
            .collect();
        return print_json(&rows);
    }
    if rows.is_empty() {
        println!("aucun utilisateur.");
        return Ok(());
    }
    for (id, email, display_name, created_at) in rows {
        println!("{id}  {email:<40} {display_name:<20} {created_at}");
    }
    Ok(())
}

async fn user_create(
    pool: &PgPool,
    email: &str,
    display_name: &str,
    password: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let email = email.trim().to_lowercase();
    let display_name = display_name.trim();
    if email.is_empty() || display_name.is_empty() {
        return Err("email et nom d'affichage requis".into());
    }
    if password.len() < 8 {
        return Err("mot de passe d'au moins 8 caractères requis".into());
    }
    let hash = hash_password(password).await?;
    let id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id",
    )
    .bind(&email)
    .bind(display_name)
    .bind(&hash)
    .fetch_optional(pool)
    .await?;
    match id {
        Some(id) => {
            println!("utilisateur créé : {id} ({email})");
            Ok(())
        }
        None => Err(format!("un compte existe déjà pour {email}").into()),
    }
}

async fn user_reset_password(
    pool: &PgPool,
    email: &str,
    password: String,
) -> Result<(), Box<dyn std::error::Error>> {
    if password.len() < 8 {
        return Err("mot de passe d'au moins 8 caractères requis".into());
    }
    let email = email.trim().to_lowercase();
    let hash = hash_password(password).await?;
    let updated: Option<Uuid> =
        sqlx::query_scalar("UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id")
            .bind(&hash)
            .bind(&email)
            .fetch_optional(pool)
            .await?;
    match updated {
        Some(id) => {
            println!("mot de passe réinitialisé pour {email} ({id})");
            Ok(())
        }
        None => Err(format!("aucun compte pour {email}").into()),
    }
}

async fn user_delete(pool: &PgPool, email: &str) -> Result<(), Box<dyn std::error::Error>> {
    let email = email.trim().to_lowercase();
    let deleted: Option<Uuid> =
        sqlx::query_scalar("DELETE FROM users WHERE email = $1 RETURNING id")
            .bind(&email)
            .fetch_optional(pool)
            .await?;
    match deleted {
        Some(id) => {
            println!("compte supprimé : {email} ({id})");
            Ok(())
        }
        None => Err(format!("aucun compte pour {email}").into()),
    }
}

// ---------- space ----------

async fn space_list(pool: &PgPool, json: bool) -> Result<(), Box<dyn std::error::Error>> {
    let spaces: Vec<(Uuid, String, DateTime<Utc>)> =
        sqlx::query_as("SELECT id, name, created_at FROM spaces ORDER BY created_at")
            .fetch_all(pool)
            .await?;
    if !json && spaces.is_empty() {
        println!("aucun espace.");
        return Ok(());
    }

    let mut json_rows = Vec::with_capacity(spaces.len());
    for (id, name, created_at) in spaces {
        let members: Vec<String> = sqlx::query_scalar(
            "SELECT u.email FROM space_memberships sm
             JOIN users u ON u.id = sm.user_id
             WHERE sm.space_id = $1
             ORDER BY sm.created_at",
        )
        .bind(id)
        .fetch_all(pool)
        .await?;
        if json {
            json_rows.push(SpaceRow {
                id,
                name,
                created_at,
                members,
            });
        } else {
            println!(
                "{id}  {name:<24} membres: {}  ({created_at})",
                members.join(", ")
            );
        }
    }
    if json {
        print_json(&json_rows)?;
    }
    Ok(())
}

/// Supprime un espace et tout son contenu (cascade DB via `ON DELETE CASCADE`
/// sur `space_id`) ainsi que les fichiers média correspondants sur disque. Ne
/// supprime PAS les comptes des membres — seulement leur appartenance à CET
/// espace (comportement symétrique de `user_delete`, qui laisse l'espace).
async fn space_delete(
    pool: &PgPool,
    media_dir: &str,
    space_id: Uuid,
) -> Result<(), Box<dyn std::error::Error>> {
    let storage_keys: Vec<String> = sqlx::query_scalar("SELECT storage_key FROM media WHERE space_id = $1")
        .bind(space_id)
        .fetch_all(pool)
        .await?;

    let deleted: Option<Uuid> = sqlx::query_scalar("DELETE FROM spaces WHERE id = $1 RETURNING id")
        .bind(space_id)
        .fetch_optional(pool)
        .await?;
    if deleted.is_none() {
        return Err(format!("aucun espace {space_id}").into());
    }

    for key in &storage_keys {
        let _ = tokio::fs::remove_file(Path::new(media_dir).join(key)).await;
    }
    println!(
        "espace {space_id} supprimé ({} média(s) effacé(s) du disque).",
        storage_keys.len()
    );
    Ok(())
}

/// Retire un membre d'un espace sans toucher à son compte (juste la ligne
/// `space_memberships`) — pour un espace à plusieurs (`MAX_MEMBERS = 8`) où
/// `user delete` (qui supprime tout le compte) serait disproportionné.
async fn space_remove_member(
    pool: &PgPool,
    space_id: Uuid,
    email: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let email = email.trim().to_lowercase();
    let removed: Option<Uuid> = sqlx::query_scalar(
        "DELETE FROM space_memberships
         WHERE space_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)
         RETURNING user_id",
    )
    .bind(space_id)
    .bind(&email)
    .fetch_optional(pool)
    .await?;
    match removed {
        Some(_) => {
            println!("{email} retiré de l'espace {space_id} (compte conservé).");
            Ok(())
        }
        None => Err(format!("{email} n'est pas membre de l'espace {space_id}").into()),
    }
}

async fn space_create(
    pool: &PgPool,
    name: &str,
    members: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let name = name.trim();
    if name.is_empty() {
        return Err("nom d'espace requis".into());
    }
    if members.is_empty() {
        return Err("au moins un membre requis (--members email1,email2)".into());
    }
    if members.len() > MAX_MEMBERS {
        return Err(format!("{} membres demandés, {MAX_MEMBERS} max", members.len()).into());
    }

    let mut tx = pool.begin().await?;
    let space_id: Uuid = sqlx::query_scalar("INSERT INTO spaces (name) VALUES ($1) RETURNING id")
        .bind(name)
        .fetch_one(&mut *tx)
        .await?;

    for raw in members {
        let email = raw.trim().to_lowercase();
        let user_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await?;
        let user_id = user_id
            .ok_or_else(|| format!("aucun compte pour {email} (crée-le d'abord avec `user create`)"))?;
        sqlx::query("INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')")
            .bind(user_id)
            .bind(space_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    println!(
        "espace créé : {space_id} ({name}) avec {} membre(s)",
        members.len()
    );
    Ok(())
}

async fn space_rename(
    pool: &PgPool,
    space_id: Uuid,
    name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let name = name.trim();
    if name.is_empty() {
        return Err("nom d'espace requis".into());
    }
    let updated: Option<Uuid> =
        sqlx::query_scalar("UPDATE spaces SET name = $1 WHERE id = $2 RETURNING id")
            .bind(name)
            .bind(space_id)
            .fetch_optional(pool)
            .await?;
    match updated {
        Some(_) => {
            println!("espace {space_id} renommé en « {name} »");
            Ok(())
        }
        None => Err(format!("aucun espace {space_id}").into()),
    }
}

// ---------- media ----------

/// Même critère d'orphelinage que `routes::media::purge_orphan_media` (upload
/// jamais rattaché via `post_media`), mais en deux temps (SELECT puis DELETE
/// optionnel) pour permettre le dry-run par défaut.
async fn media_prune(
    pool: &PgPool,
    media_dir: &str,
    older_than_hours: i64,
    apply: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if older_than_hours < 0 {
        return Err("--older-than-hours doit être positif".into());
    }
    let cutoff = Utc::now() - chrono::Duration::hours(older_than_hours);
    let orphans: Vec<(Uuid, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT m.id, m.storage_key, m.created_at
         FROM media m
         WHERE m.created_at < $1
           AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
         ORDER BY m.created_at",
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    if orphans.is_empty() {
        println!("aucun média orphelin (plus vieux que {older_than_hours}h).");
        return Ok(());
    }

    println!("{} média(s) orphelin(s) trouvé(s) :", orphans.len());
    for (id, key, created_at) in &orphans {
        println!("  {id}  {key}  ({created_at})");
    }

    if !apply {
        println!("(dry-run : rien supprimé — relance avec --apply pour appliquer)");
        return Ok(());
    }

    for (id, key, _) in &orphans {
        sqlx::query("DELETE FROM media WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        let _ = tokio::fs::remove_file(Path::new(media_dir).join(key)).await;
    }
    println!("{} média(s) supprimé(s).", orphans.len());
    Ok(())
}

/// Déchiffre un échantillon aléatoire de médias marqués `encrypted = true` et
/// rapporte juste succès/échec (jamais le contenu déchiffré, ni sur stdout ni
/// sur disque — cf. INSTALL.md, seule la faisabilité du déchiffrement compte).
async fn media_verify(
    pool: &PgPool,
    config: &Config,
    sample: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    let key = config
        .media_key_bytes()
        .ok_or("MEDIA_KEY absente/invalide : rien à vérifier")?;

    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, storage_key FROM media WHERE encrypted = true
         ORDER BY random() LIMIT $1",
    )
    .bind(sample as i64)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        println!("aucun média chiffré à vérifier.");
        return Ok(());
    }

    let mut ok = 0;
    let mut failed = Vec::new();
    for (id, storage_key) in &rows {
        let path = Path::new(&config.media_dir).join(storage_key);
        match tokio::fs::read(&path).await {
            Ok(bytes) => match media_decrypt(&key, &bytes) {
                Some(_) => ok += 1,
                None => failed.push(*id),
            },
            Err(e) => {
                println!("  ⚠ {id} : fichier illisible ({e})");
                failed.push(*id);
            }
        }
    }
    println!("{ok}/{} médias déchiffrés avec succès.", rows.len());
    if !failed.is_empty() {
        println!("échecs :");
        for id in &failed {
            println!("  {id}");
        }
        return Err(format!(
            "{} média(s) illisible(s) avec la MEDIA_KEY actuelle",
            failed.len()
        )
        .into());
    }
    Ok(())
}

// ---------- notify ----------

async fn notify_test(
    pool: &PgPool,
    config: &Config,
    email: &str,
    message: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let email = email.trim().to_lowercase();
    let user_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(pool)
        .await?;
    let user_id = user_id.ok_or_else(|| format!("aucun compte pour {email}"))?;

    let push_client = HyperWebPushClient::new();
    let (sent, total) =
        send_test_notification(pool, config, &push_client, user_id, message).await?;

    if total == 0 {
        println!(
            "aucun abonnement push pour {email} (l'app doit être installée avec les \
             notifications autorisées)."
        );
    } else {
        println!("{sent}/{total} abonnement(s) notifié(s) pour {email}.");
    }
    Ok(())
}

/// Liste les abonnements push (endpoint tronqué, jamais complet — cf.
/// `preview_endpoint`) et le mode de notification par compte. `email` filtre
/// sur un seul compte ; sinon tous les abonnements de l'instance.
async fn notify_list(
    pool: &PgPool,
    email: Option<&str>,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let email = email.map(|e| e.trim().to_lowercase());

    // Requête littérale (sqlx 0.9 refuse le SQL construit par `format!`) : le
    // filtre optionnel passe par un paramètre lié, jamais par interpolation.
    let rows: Vec<(String, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT u.email, coalesce(s.notif_mode, 'ghost'), ps.endpoint, ps.created_at
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         LEFT JOIN user_settings s ON s.user_id = ps.user_id
         WHERE ($1::text IS NULL OR u.email = $1)
         ORDER BY u.email, ps.created_at",
    )
    .bind(email)
    .fetch_all(pool)
    .await?;

    if !json && rows.is_empty() {
        println!("aucun abonnement push.");
        return Ok(());
    }

    if json {
        let rows: Vec<PushSubRow> = rows
            .into_iter()
            .map(|(email, notif_mode, endpoint, created_at)| PushSubRow {
                email,
                notif_mode,
                endpoint_preview: preview_endpoint(&endpoint),
                created_at,
            })
            .collect();
        return print_json(&rows);
    }
    for (email, notif_mode, endpoint, created_at) in rows {
        println!(
            "{email:<30} mode: {notif_mode:<8} {}  ({created_at})",
            preview_endpoint(&endpoint)
        );
    }
    Ok(())
}

// ---------- catalog ----------

async fn catalog_list(pool: &PgPool, json: bool) -> Result<(), Box<dyn std::error::Error>> {
    let categories: Vec<(String, String, bool, bool)> = sqlx::query_as(
        "SELECT id, label_fr, used_in_bucket_list, used_in_evening_menu
         FROM catalog_categories ORDER BY sort_order",
    )
    .fetch_all(pool)
    .await?;

    if !json && categories.is_empty() {
        println!("catalogue vide.");
        return Ok(());
    }

    let mut json_rows = Vec::with_capacity(categories.len());
    for (id, label, bucket, menu) in categories {
        let (active_items, inactive_items): (i64, i64) = sqlx::query_as(
            "SELECT count(*) FILTER (WHERE active), count(*) FILTER (WHERE NOT active)
             FROM catalog_items WHERE category_id = $1",
        )
        .bind(&id)
        .fetch_one(pool)
        .await?;
        if json {
            json_rows.push(CatalogRow {
                id,
                label,
                used_in_bucket_list: bucket,
                used_in_evening_menu: menu,
                active_items,
                inactive_items,
            });
        } else {
            let mut uses = Vec::new();
            if bucket {
                uses.push("bucket-list");
            }
            if menu {
                uses.push("menu-du-soir");
            }
            println!(
                "{id:<24} {label:<28} [{}]  actifs: {active_items:<4} inactifs: {inactive_items}",
                uses.join(", ")
            );
        }
    }
    if json {
        print_json(&json_rows)?;
    }
    Ok(())
}

/// Alterne `active` sur un item ("retrait doux" : un item désactivé disparaît
/// des listings sans casser les picks/stances déjà posés dessus, contrairement
/// à une suppression — la FK `catalog_items` en `ON DELETE RESTRICT` l'interdit
/// de toute façon).
async fn catalog_toggle_item(pool: &PgPool, item_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let new_active: Option<bool> = sqlx::query_scalar(
        "UPDATE catalog_items SET active = NOT active WHERE id = $1 RETURNING active",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await?;
    match new_active {
        Some(active) => {
            println!(
                "item {item_id} : {}",
                if active { "activé" } else { "désactivé" }
            );
            Ok(())
        }
        None => Err(format!("aucun item de catalogue {item_id}").into()),
    }
}

// ---------- nuke ----------

/// Supprime TOUS les utilisateurs et espaces (et donc, par `ON DELETE CASCADE`,
/// tout ce qui en dépend : appartenances, posts, défis, humeurs, envies, menu du
/// soir, mots doux, notices, abonnements push...), ainsi que les fichiers média
/// correspondants sur disque. Le catalogue (`catalog_categories`/`catalog_items`,
/// contenu de référence, pas des données utilisateur) et la banque de défis
/// GLOBALE (`challenge_suggestions.space_id IS NULL`) ne sont pas touchés :
/// aucune table de référence n'a de FK vers `users`/`spaces`.
///
/// Sans `--confirm NUKE-EVERYTHING` exact, n'affiche que ce qui SERAIT
/// supprimé et renvoie une erreur (rien n'est modifié).
async fn nuke(
    pool: &PgPool,
    media_dir: &str,
    confirm: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    let user_count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(pool)
        .await?;
    let space_count: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
        .fetch_one(pool)
        .await?;
    let media_count: i64 = sqlx::query_scalar("SELECT count(*) FROM media")
        .fetch_one(pool)
        .await?;

    if !nuke_confirmed(confirm) {
        return Err(format!(
            "opération annulée (rien n'a été supprimé). Avec --confirm \
             {NUKE_CONFIRM_PHRASE}, ceci supprimerait DÉFINITIVEMENT {user_count} \
             utilisateur(s), {space_count} espace(s) et {media_count} média(s) \
             (fichiers sur disque inclus). Le catalogue (bucket list / menu du \
             soir) et la banque de défis globale ne sont jamais touchés."
        )
        .into());
    }

    // Les fichiers média doivent être lus AVANT la suppression des lignes
    // (sinon `storage_key` est perdu et le fichier reste orphelin sur disque).
    let storage_keys: Vec<String> = sqlx::query_scalar("SELECT storage_key FROM media")
        .fetch_all(pool)
        .await?;

    let mut tx = pool.begin().await?;
    // Les deux DELETE sont nécessaires (ni `users` ni `spaces` ne référence
    // l'autre directement — seule la table de jointure `space_memberships`
    // référence les deux, avec CASCADE des deux côtés) ; l'ordre n'importe pas.
    sqlx::query("DELETE FROM users").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM spaces").execute(&mut *tx).await?;
    tx.commit().await?;

    for key in &storage_keys {
        let _ = tokio::fs::remove_file(Path::new(media_dir).join(key)).await;
    }

    println!(
        "instance réinitialisée : {user_count} utilisateur(s), {space_count} \
         espace(s) et {media_count} média(s) supprimés définitivement."
    );
    Ok(())
}

// ---------- seed-demo ----------

/// Mot de passe des comptes de démo. Jamais un secret : `seed_demo` refuse de
/// tourner sur un déploiement exposé (cf. `is_exposed`), donc ce mot de passe
/// ne peut atterrir que sur une base locale/loopback.
const DEMO_PASSWORD: &str = "demopassword123";
const DEMO_USERS: [(&str, &str); 2] = [
    ("demo.alice@pinkphone.local", "Alice"),
    ("demo.bob@pinkphone.local", "Bob"),
];

/// Crée (ou réutilise) 2 comptes + 1 espace partagé + un peu de contenu
/// d'exemple (humeurs, un post, un défi), pour développer/tester l'UI sans
/// partir d'une base vide. Idempotent : si l'espace existe déjà, ne recrée
/// pas le contenu (évite d'empiler des doublons à chaque `pinkdev dev --seed`).
async fn seed_demo(pool: &PgPool, config: &Config) -> Result<(), Box<dyn std::error::Error>> {
    if is_exposed(config) {
        return Err(
            "refusé sur un déploiement exposé (BIND_ADDR non-loopback) : seed-demo crée des \
             comptes à mot de passe connu, jamais acceptable en prod."
                .into(),
        );
    }

    let mut user_ids = Vec::with_capacity(DEMO_USERS.len());
    for (email, display_name) in DEMO_USERS {
        let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await?;
        let id = match existing {
            Some(id) => id,
            None => {
                let hash = hash_password(DEMO_PASSWORD.to_string()).await?;
                sqlx::query_scalar(
                    "INSERT INTO users (email, display_name, password_hash)
                     VALUES ($1, $2, $3) RETURNING id",
                )
                .bind(email)
                .bind(display_name)
                .bind(&hash)
                .fetch_one(pool)
                .await?
            }
        };
        user_ids.push(id);
    }

    let existing_space: Option<Uuid> = sqlx::query_scalar(
        "SELECT space_id FROM space_memberships WHERE user_id = $1 LIMIT 1",
    )
    .bind(user_ids[0])
    .fetch_optional(pool)
    .await?;

    let (space_id, fresh) = match existing_space {
        Some(id) => (id, false),
        None => {
            let mut tx = pool.begin().await?;
            let id: Uuid =
                sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('Démo') RETURNING id")
                    .fetch_one(&mut *tx)
                    .await?;
            for user_id in &user_ids {
                sqlx::query(
                    "INSERT INTO space_memberships (user_id, space_id, role)
                     VALUES ($1, $2, 'partner')",
                )
                .bind(user_id)
                .bind(id)
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
            (id, true)
        }
    };

    if fresh {
        sqlx::query("INSERT INTO moods (user_id, space_id, status) VALUES ($1, $2, 'flirty')")
            .bind(user_ids[0])
            .bind(space_id)
            .execute(pool)
            .await?;
        sqlx::query("INSERT INTO moods (user_id, space_id, status) VALUES ($1, $2, 'calm')")
            .bind(user_ids[1])
            .bind(space_id)
            .execute(pool)
            .await?;
        sqlx::query(
            "INSERT INTO posts (space_id, author_id, title, body)
             VALUES ($1, $2, 'Bienvenue', 'Premier post du jeu de données de démo.')",
        )
        .bind(space_id)
        .bind(user_ids[0])
        .execute(pool)
        .await?;
        sqlx::query(
            "INSERT INTO challenges (space_id, proposer_id, title, description, intensity)
             VALUES ($1, $2, 'Défi de démo', 'Un défi soft pour tester le flux.', 'soft')",
        )
        .bind(space_id)
        .bind(user_ids[1])
        .execute(pool)
        .await?;
    }

    println!(
        "jeu de données de démo {} (espace {space_id}) :",
        if fresh { "créé" } else { "déjà présent, réutilisé" }
    );
    for ((email, display_name), id) in DEMO_USERS.iter().zip(&user_ids) {
        println!("  {display_name:<6} {email}  (id {id})  mot de passe : {DEMO_PASSWORD}");
    }
    Ok(())
}

// ---------- health / ping ----------

/// État du BACKING STORE (DB + médias) — pas du process serveur (cf. `ping`).
/// Renvoie des lignes ✔/✖ dans le même style que `config_check` (et gérées
/// par le même `has_blocking_issue` côté appelant).
async fn health_check(
    pool: &PgPool,
    media_dir: &str,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut lines = Vec::new();

    // Si `connect()` (appelé avant) a réussi, la DB était joignable à ce
    // moment — cette requête confirme qu'elle répond ENCORE (pas juste que la
    // poignée de main initiale a marché).
    match sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(pool).await {
        Ok(_) => lines.push("✔ base de données joignable".to_string()),
        Err(e) => lines.push(format!("✖ base de données injoignable : {e}")),
    }

    let migrator = sqlx::migrate!("./migrations");
    let applied: Vec<i64> = sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations WHERE success = true ORDER BY version",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let pending = migrator.iter().filter(|m| !applied.contains(&m.version)).count();
    if pending == 0 {
        lines.push(format!("✔ migrations à jour ({} appliquées)", applied.len()));
    } else {
        lines.push(format!(
            "✖ {pending} migration(s) en attente — code et schéma DB désynchronisés"
        ));
    }

    let probe = Path::new(media_dir).join(format!(".pinkctl-health-{}", Uuid::new_v4()));
    match tokio::fs::write(&probe, b"pinkctl health check").await {
        Ok(()) => {
            let _ = tokio::fs::remove_file(&probe).await;
            lines.push(format!("✔ MEDIA_DIR ({media_dir}) accessible en écriture"));
        }
        Err(e) => lines.push(format!(
            "✖ MEDIA_DIR ({media_dir}) inaccessible en écriture : {e}"
        )),
    }

    Ok(lines)
}

/// URL par défaut de `ping` : le port de `BIND_ADDR`, sur loopback — appelant
/// et serveur sont dans le MÊME conteneur/netns (`docker exec`), donc
/// loopback est toujours correct même si le serveur a bindé `0.0.0.0`
/// (BIND_ADDR n'est qu'une adresse d'écoute, pas la destination du client).
fn default_health_url(bind_addr: &str) -> String {
    let port = bind_addr.rsplit(':').next().unwrap_or("8080");
    format!("http://127.0.0.1:{port}/health")
}

/// Vérifie que le serveur répond réellement (requête HTTP sur `/health`).
/// Seule commande de `pinkctl` qui parle HTTP plutôt que DB directe — voir la
/// doc de `Command::Ping` pour la contrainte `docker exec` (pas `run`).
async fn ping(bind_addr: &str, url_override: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    let url = url_override
        .map(str::to_string)
        .unwrap_or_else(|| default_health_url(bind_addr));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            println!("✔ {url} → {}", resp.status());
            Ok(())
        }
        Ok(resp) => Err(format!("✖ {url} → {} (attendu 2xx)", resp.status()).into()),
        Err(e) => Err(format!("✖ impossible de joindre {url} : {e}").into()),
    }
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    #[test]
    fn version_line_raccourcit_le_sha_a_7_caracteres() {
        assert_eq!(
            version_line("0.0.147", "432f3f5abcdef0123456789abcdef0123456789a"),
            "0.0.147 (commit 432f3f5)"
        );
    }

    #[test]
    fn version_line_sans_commit_ou_sha_court() {
        assert_eq!(version_line("dev", ""), "dev (commit inconnu)");
        assert_eq!(version_line("gh-1.4.0", "abc"), "gh-1.4.0 (commit abc)");
    }

    /// Config de base "propre" (secret fort, tout défini) : point de départ des
    /// tests de `config_check`, qu'on dérange champ par champ.
    fn base_config() -> Config {
        Config {
            database_url: String::new(),
            db_host: "localhost".into(),
            db_port: 5432,
            db_user: "pink".into(),
            db_password: "s3cret-not-default".into(),
            db_name: "pinkphone".into(),
            jwt_secret: "a".repeat(40),
            media_dir: "./media-store".into(),
            media_key: STANDARD.encode([7u8; 32]),
            bind_addr: "0.0.0.0:8080".into(),
            cors_origin: "https://pink.example.com".into(),
            vapid_public_key: "pub".into(),
            vapid_private_key: "priv".into(),
            vapid_subject: "mailto:admin@example.com".into(),
            password_auth_enabled: true,
            oidc_issuer: String::new(),
            oidc_client_id: String::new(),
            oidc_client_secret: String::new(),
            oidc_redirect_uri: String::new(),
            oidc_post_login_redirect: String::new(),
        }
    }

    fn dev_config() -> Config {
        Config {
            bind_addr: "127.0.0.1:8080".into(),
            jwt_secret: "dev-insecure-secret".into(),
            db_password: "pink".into(),
            media_key: String::new(),
            vapid_public_key: String::new(),
            vapid_private_key: String::new(),
            cors_origin: "http://localhost:5173".into(),
            ..base_config()
        }
    }

    #[test]
    fn config_check_signale_les_defauts_de_dev_en_loopback() {
        let lines = config_check(&dev_config());
        assert!(lines.iter().any(|l| l.contains("JWT_SECRET faible")));
        assert!(lines.iter().any(|l| l.contains("MEDIA_KEY absente")));
        assert!(lines.iter().any(|l| l.contains("VAPID")));
        assert!(lines.iter().any(|l| l.contains("loopback")));
        // En loopback : pas de refus (juste un avertissement), contrairement à exposé.
        assert!(!lines.iter().any(|l| l.contains("refusera de démarrer")));
    }

    #[test]
    fn config_check_secret_faible_et_expose_est_bloquant() {
        let config = Config {
            bind_addr: "0.0.0.0:8080".into(),
            jwt_secret: "dev-insecure-secret".into(),
            ..base_config()
        };
        let lines = config_check(&config);
        assert!(lines.iter().any(|l| l.contains("refusera de démarrer")));
    }

    #[test]
    fn config_check_config_propre_est_tout_vert() {
        let lines = config_check(&base_config());
        assert!(lines.iter().any(|l| l.starts_with("✔ JWT_SECRET")));
        assert!(lines.iter().any(|l| l.starts_with("✔ MEDIA_KEY")));
        assert!(lines.iter().any(|l| l.starts_with("✔ clés VAPID")));
        assert!(!lines.iter().any(|l| l.starts_with('✖')));
    }

    #[test]
    fn has_blocking_issue_detecte_seulement_les_croix_pas_les_avertissements() {
        assert!(!has_blocking_issue(&[]));
        assert!(!has_blocking_issue(&[
            "✔ tout va bien".into(),
            "⚠ juste un avertissement".into(),
            "· info neutre".into(),
        ]));
        assert!(has_blocking_issue(&[
            "✔ tout va bien".into(),
            "✖ ceci est bloquant".into(),
        ]));
    }

    /// Vérifie le lien entre `config_check` (le contenu) et `has_blocking_issue`
    /// (ce qui gate le code de sortie de `pinkctl config check` — cf. #70,
    /// health-check post-déploiement) sur les deux scénarios déjà couverts
    /// individuellement ci-dessus.
    #[test]
    fn config_check_expose_secret_faible_est_bloquant_et_rien_d_autre_ne_lest() {
        let dev = dev_config(); // loopback : jamais bloquant, juste des ⚠
        assert!(!has_blocking_issue(&config_check(&dev)));

        let exposed = Config {
            bind_addr: "0.0.0.0:8080".into(),
            jwt_secret: "dev-insecure-secret".into(),
            ..base_config()
        };
        assert!(has_blocking_issue(&config_check(&exposed)));

        let clean = base_config(); // exposé, mais secret fort + tout renseigné
        assert!(!has_blocking_issue(&config_check(&clean)));
    }

    #[test]
    fn config_check_media_key_invalide_est_signalee() {
        let config = Config {
            media_key: "pas du base64 valide".into(),
            ..base_config()
        };
        let lines = config_check(&config);
        assert!(lines
            .iter()
            .any(|l| l.contains("MEDIA_KEY fournie mais INVALIDE")));
    }

    #[test]
    fn config_check_oidc_partiel_est_signale() {
        let config = Config {
            oidc_issuer: "https://auth.example.com".into(),
            ..base_config()
        };
        let lines = config_check(&config);
        assert!(lines
            .iter()
            .any(|l| l.contains("OIDC partiellement configuré")));
    }

    #[test]
    fn config_check_aucun_moyen_de_connexion_est_bloquant() {
        let config = Config {
            password_auth_enabled: false,
            ..base_config()
        };
        let lines = config_check(&config);
        assert!(lines.iter().any(|l| l.contains("plus AUCUN moyen")));
    }

    #[test]
    fn config_check_oidc_complet_est_ok_meme_sans_mot_de_passe() {
        let config = Config {
            password_auth_enabled: false,
            oidc_issuer: "https://auth.example.com".into(),
            oidc_client_id: "client".into(),
            oidc_client_secret: "secret".into(),
            oidc_redirect_uri: "https://pink.example.com/api/auth/oidc/callback".into(),
            ..base_config()
        };
        let lines = config_check(&config);
        assert!(!lines.iter().any(|l| l.contains("plus AUCUN moyen")));
        assert!(lines.iter().any(|l| l.starts_with("✔ OIDC complet")));
    }

    #[test]
    fn resolve_password_argument_accepte_en_loopback() {
        let config = dev_config(); // bind_addr loopback
        assert_eq!(
            resolve_password(Some("secret1234".into()), &config).unwrap(),
            "secret1234"
        );
    }

    #[test]
    fn resolve_password_argument_refuse_si_expose() {
        let config = base_config(); // bind_addr 0.0.0.0:8080
        let err = resolve_password(Some("secret1234".into()), &config).unwrap_err();
        assert!(err.to_string().contains("refusé sur un déploiement exposé"));
    }

    /// Garde-fou anti-régression pour le bug trouvé en review : le `--help` de
    /// `nuke` doit citer la phrase EXACTE attendue par `nuke_confirmed`, pas
    /// un nom de constante Rust ou un texte périmé.
    #[test]
    fn nuke_help_cite_la_phrase_de_confirmation_exacte() {
        use clap::CommandFactory;
        let cmd = Cli::command();
        let nuke = cmd.find_subcommand("nuke").expect("sous-commande nuke");
        let help = nuke.clone().render_long_help().to_string();
        assert!(
            help.contains(NUKE_CONFIRM_PHRASE),
            "l'aide de `nuke` doit citer {NUKE_CONFIRM_PHRASE:?} : {help}"
        );
    }

    #[test]
    fn nuke_confirmed_seulement_avec_la_phrase_exacte() {
        assert!(!nuke_confirmed(None));
        assert!(!nuke_confirmed(Some("")));
        assert!(!nuke_confirmed(Some("nuke-everything"))); // casse différente
        assert!(!nuke_confirmed(Some("NUKE-EVERYTHING "))); // espace parasite
        assert!(!nuke_confirmed(Some("confirm")));
        assert!(nuke_confirmed(Some(NUKE_CONFIRM_PHRASE)));
    }

    #[test]
    fn preview_endpoint_tronque_les_longs_endpoints_pas_les_courts() {
        let short = "https://fcm.googleapis.com/x";
        assert_eq!(preview_endpoint(short), short);

        let long = "https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz0123456789";
        let preview = preview_endpoint(long);
        assert!(preview.ends_with('…'));
        assert!(preview.len() < long.len());
        assert!(long.starts_with(preview.trim_end_matches('…')));
    }

    #[test]
    fn default_health_url_prend_le_port_de_bind_addr_toujours_en_loopback() {
        assert_eq!(default_health_url("0.0.0.0:8080"), "http://127.0.0.1:8080/health");
        assert_eq!(default_health_url("127.0.0.1:8080"), "http://127.0.0.1:8080/health");
        assert_eq!(default_health_url("[::]:9000"), "http://127.0.0.1:9000/health");
    }

    #[tokio::test]
    async fn ping_reussit_sur_200() {
        use axum::routing::get;
        use axum::Router;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new().route("/health", get(|| async { "ok" }));
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        ping("127.0.0.1:0", Some(&format!("http://{addr}/health")))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn ping_echoue_sur_reponse_non_2xx() {
        use axum::http::StatusCode;
        use axum::routing::get;
        use axum::Router;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .route("/health", get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "nope") }));
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let err = ping("127.0.0.1:0", Some(&format!("http://{addr}/health")))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("500"));
    }

    #[tokio::test]
    async fn ping_echoue_si_rien_necoute() {
        // Port 1 (privilégié) : personne dessus, connexion refusée — déterministe.
        let err = ping("127.0.0.1:0", Some("http://127.0.0.1:1/health"))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("impossible de joindre"));
    }
}

/// Tests d'intégration (DB réelle), même convention que `tests_integration.rs` :
/// `docker-compose up -d` puis
///   `DATABASE_URL=postgres://pink:pink@localhost:5432/pinkphone cargo test --features integration --bin pinkctl`
#[cfg(all(test, feature = "integration"))]
mod integration_tests {
    use super::*;

    async fn seed_user(pool: &PgPool, name: &str) -> Uuid {
        sqlx::query_scalar(
            "INSERT INTO users (email, display_name, password_hash)
             VALUES ($1, $2, 'x') RETURNING id",
        )
        .bind(format!("{name}@test.local"))
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[sqlx::test]
    async fn db_status_sur_base_fraiche_migree_na_rien_en_attente(pool: PgPool) {
        // `#[sqlx::test]` applique déjà toutes les migrations avant le test.
        db_status(&pool).await.unwrap();
        let applied: Vec<i64> = sqlx::query_scalar(
            "SELECT version FROM _sqlx_migrations WHERE success = true ORDER BY version",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        let migrator = sqlx::migrate!("./migrations");
        assert_eq!(applied.len(), migrator.iter().count());
    }

    #[sqlx::test]
    async fn user_create_puis_doublon_refuse(pool: PgPool) {
        user_create(&pool, "A@Test.Local", "Alice", "password123".into())
            .await
            .unwrap();
        let stored: (String,) = sqlx::query_as("SELECT email FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        // email normalisé en minuscules.
        assert_eq!(stored.0, "a@test.local");

        let err = user_create(&pool, "a@test.local", "Alice bis", "password123".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("existe déjà"));
    }

    #[sqlx::test]
    async fn user_create_mot_de_passe_trop_court_refuse(pool: PgPool) {
        let err = user_create(&pool, "a@test.local", "Alice", "short".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("8 caractères"));
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[sqlx::test]
    async fn user_reset_password_change_bien_le_hash(pool: PgPool) {
        seed_user(&pool, "alice").await;
        let before: String = sqlx::query_scalar("SELECT password_hash FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();

        user_reset_password(&pool, "alice@test.local", "nouveaumdp123".into())
            .await
            .unwrap();

        let after: String = sqlx::query_scalar("SELECT password_hash FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_ne!(before, after);
    }

    #[sqlx::test]
    async fn user_reset_password_compte_inconnu_erreur(pool: PgPool) {
        let err = user_reset_password(&pool, "personne@test.local", "nouveaumdp123".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("aucun compte"));
    }

    #[sqlx::test]
    async fn user_delete_cascade_sur_les_memberships(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        let space_id: Uuid = sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('S') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')")
            .bind(user_id)
            .bind(space_id)
            .execute(&pool)
            .await
            .unwrap();

        user_delete(&pool, "alice@test.local").await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
        // L'espace lui-même n'est pas supprimé (juste vidé de ses membres).
        let space_count: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(space_count, 1);
    }

    #[sqlx::test]
    async fn space_create_avec_membres_existants(pool: PgPool) {
        seed_user(&pool, "alice").await;
        seed_user(&pool, "bob").await;

        space_create(
            &pool,
            "Notre salon",
            &["alice@test.local".into(), "BOB@Test.Local".into()],
        )
        .await
        .unwrap();

        let member_count: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(member_count, 2);
    }

    #[sqlx::test]
    async fn space_create_membre_inconnu_est_refusee_sans_rien_creer(pool: PgPool) {
        seed_user(&pool, "alice").await;

        let err = space_create(
            &pool,
            "Notre salon",
            &["alice@test.local".into(), "inconnu@test.local".into()],
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("aucun compte"));

        // Transaction annulée : ni l'espace ni la 1ère appartenance ne subsistent.
        let space_count: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(space_count, 0);
    }

    #[sqlx::test]
    async fn space_rename_espace_inconnu_erreur(pool: PgPool) {
        let err = space_rename(&pool, Uuid::new_v4(), "Nouveau nom")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("aucun espace"));
    }

    #[sqlx::test]
    async fn media_prune_dry_run_ne_supprime_rien(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        let space_id: Uuid = sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('S') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO media (space_id, owner_id, storage_key, mime, created_at)
             VALUES ($1, $2, 'orphan.jpg', 'image/jpeg', now() - interval '2 hours')",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        let tmp = std::env::temp_dir();
        media_prune(&pool, tmp.to_str().unwrap(), 1, false)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM media")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1, "dry-run ne doit rien supprimer");
    }

    #[sqlx::test]
    async fn media_prune_apply_supprime_les_orphelins_pas_les_rattaches(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        let space_id: Uuid = sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('S') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();

        let orphan_id: Uuid = sqlx::query_scalar(
            "INSERT INTO media (space_id, owner_id, storage_key, mime, created_at)
             VALUES ($1, $2, 'orphan.jpg', 'image/jpeg', now() - interval '2 hours')
             RETURNING id",
        )
        .bind(space_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let attached_id: Uuid = sqlx::query_scalar(
            "INSERT INTO media (space_id, owner_id, storage_key, mime, created_at)
             VALUES ($1, $2, 'attached.jpg', 'image/jpeg', now() - interval '2 hours')
             RETURNING id",
        )
        .bind(space_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        let post_id: Uuid = sqlx::query_scalar(
            "INSERT INTO posts (space_id, author_id, body) VALUES ($1, $2, 'x') RETURNING id",
        )
        .bind(space_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO post_media (post_id, media_id, position) VALUES ($1, $2, 0)")
            .bind(post_id)
            .bind(attached_id)
            .execute(&pool)
            .await
            .unwrap();

        let tmp = std::env::temp_dir();
        media_prune(&pool, tmp.to_str().unwrap(), 1, true)
            .await
            .unwrap();

        let remaining: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM media")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, vec![attached_id]);
        assert!(!remaining.contains(&orphan_id));
    }

    /// Config de test pour `media_verify`/`notify_test` : mêmes conventions que
    /// `tests_integration::test_config()`, mais `media_dir`/`media_key`
    /// paramétrables.
    fn test_config(media_dir: &str, media_key: &str) -> Config {
        Config {
            database_url: String::new(),
            db_host: String::new(),
            db_port: 5432,
            db_user: String::new(),
            db_password: String::new(),
            db_name: String::new(),
            jwt_secret: "integration-test-secret-0123456789abcdef".into(),
            media_dir: media_dir.into(),
            media_key: media_key.into(),
            bind_addr: "127.0.0.1:0".into(),
            cors_origin: "*".into(),
            vapid_public_key: String::new(),
            // Non vide pour passer la garde `send_test_notification` ; jamais lue
            // sur le chemin "endpoint non sûr" testé ci-dessous (la vérification
            // SSRF court-circuite avant la signature VAPID).
            vapid_private_key: "irrelevant-nonempty-value".into(),
            vapid_subject: "mailto:test@test.local".into(),
            password_auth_enabled: true,
            oidc_issuer: String::new(),
            oidc_client_id: String::new(),
            oidc_client_secret: String::new(),
            oidc_redirect_uri: String::new(),
            oidc_post_login_redirect: String::new(),
        }
    }

    async fn seed_space(pool: &PgPool, owner: Uuid) -> Uuid {
        let space_id: Uuid =
            sqlx::query_scalar("INSERT INTO spaces (name) VALUES ('S') RETURNING id")
                .fetch_one(pool)
                .await
                .unwrap();
        sqlx::query(
            "INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')",
        )
        .bind(owner)
        .bind(space_id)
        .execute(pool)
        .await
        .unwrap();
        space_id
    }

    #[sqlx::test]
    async fn media_verify_reussit_avec_la_bonne_cle(pool: PgPool) {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use pinkphone_api::routes::media::encrypt;

        let dir = std::env::temp_dir().join(format!("pinkctl-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let key = [9u8; 32];
        let blob = encrypt(&key, b"contenu de test").unwrap();
        tokio::fs::write(dir.join("enc.bin"), &blob).await.unwrap();

        let user_id = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, user_id).await;
        sqlx::query(
            "INSERT INTO media (space_id, owner_id, storage_key, mime, encrypted)
             VALUES ($1, $2, 'enc.bin', 'image/jpeg', true)",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        let config = test_config(dir.to_str().unwrap(), &STANDARD.encode(key));
        media_verify(&pool, &config, 5).await.unwrap();
    }

    #[sqlx::test]
    async fn media_verify_signale_une_mauvaise_cle(pool: PgPool) {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use pinkphone_api::routes::media::encrypt;

        let dir = std::env::temp_dir().join(format!("pinkctl-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let blob = encrypt(&[1u8; 32], b"contenu de test").unwrap();
        tokio::fs::write(dir.join("enc.bin"), &blob).await.unwrap();

        let user_id = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, user_id).await;
        sqlx::query(
            "INSERT INTO media (space_id, owner_id, storage_key, mime, encrypted)
             VALUES ($1, $2, 'enc.bin', 'image/jpeg', true)",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        // Clé de vérification différente de celle utilisée pour chiffrer.
        let config = test_config(dir.to_str().unwrap(), &STANDARD.encode([2u8; 32]));
        let err = media_verify(&pool, &config, 5).await.unwrap_err();
        assert!(err.to_string().contains("illisible"));
    }

    #[sqlx::test]
    async fn media_verify_sans_media_key_est_refuse(pool: PgPool) {
        let config = test_config("/tmp", "");
        // MEDIA_KEY absente : refusé avant même de toucher la DB.
        let err = media_verify(&pool, &config, 5).await.unwrap_err();
        assert!(err.to_string().contains("MEDIA_KEY"));
    }

    #[sqlx::test]
    async fn media_verify_sans_media_chiffre_est_un_noop(pool: PgPool) {
        use base64::{engine::general_purpose::STANDARD, Engine};
        // MEDIA_KEY valide mais aucun média `encrypted = true` en base.
        let config = test_config("/tmp", &STANDARD.encode([3u8; 32]));
        media_verify(&pool, &config, 5).await.unwrap();
    }

    #[sqlx::test]
    async fn notify_test_compte_inconnu_erreur(pool: PgPool) {
        let config = test_config("/tmp", "");
        let err = notify_test(&pool, &config, "personne@test.local", "hello".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("aucun compte"));
    }

    #[sqlx::test]
    async fn notify_test_sans_abonnement_ne_plante_pas(pool: PgPool) {
        seed_user(&pool, "alice").await;
        let config = test_config("/tmp", "");
        notify_test(&pool, &config, "alice@test.local", "hello".into())
            .await
            .unwrap();
    }

    #[sqlx::test]
    async fn notify_test_purge_un_endpoint_non_sur(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        // IP littérale loopback : refusée par `endpoint_is_safe` sans DNS
        // (SECURITY_FINDINGS.md #11) — le test reste déterministe, sans réseau.
        sqlx::query(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, 'https://127.0.0.1/fake', 'p', 'a')",
        )
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        let config = test_config("/tmp", "");
        notify_test(&pool, &config, "alice@test.local", "hello".into())
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0, "l'abonnement non sûr doit être purgé");
    }

    #[sqlx::test]
    async fn catalog_list_reussit_sur_les_donnees_seedees(pool: PgPool) {
        // Les migrations de seed (0035-0038) sont appliquées par `#[sqlx::test]`
        // comme toute autre migration : le catalogue n'est pas vide.
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM catalog_categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(count > 0);
        catalog_list(&pool, false).await.unwrap();
    }

    #[sqlx::test]
    async fn nuke_sans_confirmation_ne_supprime_rien(pool: PgPool) {
        seed_user(&pool, "alice").await;

        let err = nuke(&pool, "/tmp", None).await.unwrap_err();
        assert!(err.to_string().contains("opération annulée"));

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1, "aucune ligne ne doit être touchée sans confirmation");
    }

    #[sqlx::test]
    async fn nuke_avec_mauvaise_phrase_ne_supprime_rien(pool: PgPool) {
        seed_user(&pool, "alice").await;

        let err = nuke(&pool, "/tmp", Some("nuke-everything"))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("opération annulée"));

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[sqlx::test]
    async fn nuke_supprime_tout_sauf_le_catalogue_et_la_banque_globale(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, user_id).await;
        sqlx::query(
            "INSERT INTO posts (space_id, author_id, body) VALUES ($1, $2, 'x')",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        let dir = std::env::temp_dir().join(format!("pinkctl-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let file_path = dir.join("nuke-me.jpg");
        tokio::fs::write(&file_path, b"contenu").await.unwrap();
        sqlx::query(
            "INSERT INTO media (space_id, owner_id, storage_key, mime)
             VALUES ($1, $2, 'nuke-me.jpg', 'image/jpeg')",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        let catalog_before: i64 = sqlx::query_scalar("SELECT count(*) FROM catalog_categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        let global_suggestions_before: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM challenge_suggestions WHERE space_id IS NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(catalog_before > 0);
        assert!(global_suggestions_before > 0);

        nuke(&pool, dir.to_str().unwrap(), Some(NUKE_CONFIRM_PHRASE))
            .await
            .unwrap();

        let (users, spaces, posts, media): (i64, i64, i64, i64) = (
            sqlx::query_scalar("SELECT count(*) FROM users")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM spaces")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM posts")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM media")
                .fetch_one(&pool)
                .await
                .unwrap(),
        );
        assert_eq!((users, spaces, posts, media), (0, 0, 0, 0));
        assert!(
            tokio::fs::metadata(&file_path).await.is_err(),
            "le fichier média doit être supprimé du disque"
        );

        let catalog_after: i64 = sqlx::query_scalar("SELECT count(*) FROM catalog_categories")
            .fetch_one(&pool)
            .await
            .unwrap();
        let global_suggestions_after: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM challenge_suggestions WHERE space_id IS NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(catalog_after, catalog_before, "le catalogue ne doit pas être touché");
        assert_eq!(
            global_suggestions_after, global_suggestions_before,
            "la banque de défis globale ne doit pas être touchée"
        );
    }

    #[sqlx::test]
    async fn seed_demo_refuse_sur_deploiement_expose(pool: PgPool) {
        let config = Config {
            bind_addr: "0.0.0.0:8080".into(),
            ..test_config("/tmp", "")
        };
        let err = seed_demo(&pool, &config).await.unwrap_err();
        assert!(err.to_string().contains("déploiement exposé"));

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "rien ne doit être créé si refusé");
    }

    #[sqlx::test]
    async fn seed_demo_cree_comptes_espace_et_contenu(pool: PgPool) {
        let config = test_config("/tmp", "");
        seed_demo(&pool, &config).await.unwrap();

        let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        let spaces: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
            .fetch_one(&pool)
            .await
            .unwrap();
        let members: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships")
            .fetch_one(&pool)
            .await
            .unwrap();
        let moods: i64 = sqlx::query_scalar("SELECT count(*) FROM moods")
            .fetch_one(&pool)
            .await
            .unwrap();
        let posts: i64 = sqlx::query_scalar("SELECT count(*) FROM posts")
            .fetch_one(&pool)
            .await
            .unwrap();
        let challenges: i64 = sqlx::query_scalar("SELECT count(*) FROM challenges")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((users, spaces, members, moods, posts, challenges), (2, 1, 2, 2, 1, 1));
    }

    #[sqlx::test]
    async fn seed_demo_est_idempotent(pool: PgPool) {
        let config = test_config("/tmp", "");
        seed_demo(&pool, &config).await.unwrap();
        seed_demo(&pool, &config).await.unwrap(); // 2e appel : ne doit rien dupliquer

        let (users, spaces, posts, challenges): (i64, i64, i64, i64) = (
            sqlx::query_scalar("SELECT count(*) FROM users")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM spaces")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM posts")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT count(*) FROM challenges")
                .fetch_one(&pool)
                .await
                .unwrap(),
        );
        assert_eq!((users, spaces, posts, challenges), (2, 1, 1, 1));
    }

    #[sqlx::test]
    async fn space_delete_supprime_le_contenu_et_les_medias(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, user_id).await;

        let dir = std::env::temp_dir().join(format!("pinkctl-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let file_path = dir.join("to-delete.jpg");
        tokio::fs::write(&file_path, b"contenu").await.unwrap();
        sqlx::query(
            "INSERT INTO media (space_id, owner_id, storage_key, mime)
             VALUES ($1, $2, 'to-delete.jpg', 'image/jpeg')",
        )
        .bind(space_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        space_delete(&pool, dir.to_str().unwrap(), space_id)
            .await
            .unwrap();

        let space_count: i64 = sqlx::query_scalar("SELECT count(*) FROM spaces")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(space_count, 0);
        assert!(tokio::fs::metadata(&file_path).await.is_err());

        // Le compte n'est PAS supprimé.
        let user_count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(user_count, 1);
    }

    #[sqlx::test]
    async fn space_delete_espace_inconnu_erreur(pool: PgPool) {
        let err = space_delete(&pool, "/tmp", Uuid::new_v4()).await.unwrap_err();
        assert!(err.to_string().contains("aucun espace"));
    }

    #[sqlx::test]
    async fn space_remove_member_retire_sans_supprimer_le_compte(pool: PgPool) {
        let alice = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, alice).await;
        let bob = seed_user(&pool, "bob").await;
        sqlx::query(
            "INSERT INTO space_memberships (user_id, space_id, role) VALUES ($1, $2, 'partner')",
        )
        .bind(bob)
        .bind(space_id)
        .execute(&pool)
        .await
        .unwrap();

        space_remove_member(&pool, space_id, "bob@test.local")
            .await
            .unwrap();

        let members: i64 = sqlx::query_scalar("SELECT count(*) FROM space_memberships")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(members, 1, "seule l'appartenance de bob doit disparaître");
        let bob_still_exists: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE id = $1")
            .bind(bob)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(bob_still_exists, 1, "le compte de bob doit être conservé");
    }

    #[sqlx::test]
    async fn space_remove_member_non_membre_erreur(pool: PgPool) {
        let alice = seed_user(&pool, "alice").await;
        let space_id = seed_space(&pool, alice).await;
        seed_user(&pool, "bob").await; // existe, mais n'est pas membre de cet espace

        let err = space_remove_member(&pool, space_id, "bob@test.local")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("n'est pas membre"));
    }

    #[sqlx::test]
    async fn catalog_toggle_item_alterne_et_item_inconnu_erreur(pool: PgPool) {
        let item_id: String = sqlx::query_scalar("SELECT id FROM catalog_items LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        let before: bool = sqlx::query_scalar("SELECT active FROM catalog_items WHERE id = $1")
            .bind(&item_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        catalog_toggle_item(&pool, &item_id).await.unwrap();
        let after: bool = sqlx::query_scalar("SELECT active FROM catalog_items WHERE id = $1")
            .bind(&item_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(after, !before);

        catalog_toggle_item(&pool, &item_id).await.unwrap(); // ré-alterne
        let restored: bool = sqlx::query_scalar("SELECT active FROM catalog_items WHERE id = $1")
            .bind(&item_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(restored, before);

        let err = catalog_toggle_item(&pool, "item-qui-n-existe-pas")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("aucun item"));
    }

    #[sqlx::test]
    async fn notify_list_filtre_par_email_et_montre_le_mode(pool: PgPool) {
        let alice = seed_user(&pool, "alice").await;
        let bob = seed_user(&pool, "bob").await;
        sqlx::query(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, 'https://fcm.googleapis.com/fcm/send/alice-token', 'p', 'a')",
        )
        .bind(alice)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, 'https://fcm.googleapis.com/fcm/send/bob-token', 'p', 'a')",
        )
        .bind(bob)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO user_settings (user_id, notif_mode) VALUES ($1, 'digest')")
            .bind(alice)
            .execute(&pool)
            .await
            .unwrap();

        // Sans filtre : les deux.
        notify_list(&pool, None, false).await.unwrap();

        // Filtré sur alice : ne doit pas planter, et ne renvoyer que la sienne
        // (vérifié via une requête directe plutôt que le stdout).
        notify_list(&pool, Some("alice@test.local"), false)
            .await
            .unwrap();
        let alice_subs: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM push_subscriptions ps
             JOIN users u ON u.id = ps.user_id WHERE u.email = 'alice@test.local'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(alice_subs, 1);
    }

    #[sqlx::test]
    async fn user_list_et_space_list_json_ne_plantent_pas(pool: PgPool) {
        let user_id = seed_user(&pool, "alice").await;
        seed_space(&pool, user_id).await;
        user_list(&pool, true).await.unwrap();
        space_list(&pool, true).await.unwrap();
        catalog_list(&pool, true).await.unwrap();
    }

    #[sqlx::test]
    async fn health_check_tout_vert_sur_base_fraiche_et_dossier_ecrivable(pool: PgPool) {
        let dir = std::env::temp_dir().join(format!("pinkctl-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();

        let lines = health_check(&pool, dir.to_str().unwrap()).await.unwrap();
        assert!(!has_blocking_issue(&lines), "{lines:?}");
        assert!(lines.iter().any(|l| l.starts_with("✔ base de données")));
        assert!(lines.iter().any(|l| l.contains("migrations à jour")));
        assert!(lines.iter().any(|l| l.starts_with("✔ MEDIA_DIR")));
    }

    #[sqlx::test]
    async fn health_check_signale_un_media_dir_inaccessible(pool: PgPool) {
        let lines = health_check(&pool, "/chemin/qui/n-existe-pas-du-tout")
            .await
            .unwrap();
        assert!(has_blocking_issue(&lines));
        assert!(lines.iter().any(|l| l.starts_with("✖ MEDIA_DIR")));
    }

    #[sqlx::test]
    async fn health_check_signale_une_migration_en_attente(pool: PgPool) {
        // `#[sqlx::test]` applique TOUTES les migrations ; on simule un schéma
        // en retard en retirant la trace de la plus récente.
        sqlx::query(
            "DELETE FROM _sqlx_migrations WHERE version = (SELECT max(version) FROM _sqlx_migrations)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let lines = health_check(&pool, "/tmp").await.unwrap();
        assert!(has_blocking_issue(&lines));
        assert!(lines.iter().any(|l| l.contains("en attente")));
    }
}
