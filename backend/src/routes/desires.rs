use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{desire_category, DesireItem, DESIRE_CATEGORIES};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// Bucket list d'envies à double consentement (#99), optionnelle par salon. Le
// catalogue = const `DESIRE_CATEGORIES` (libellés items + catégories via i18n
// front). Chacun coche en privé ; un code n'est « matché » que si MOI ET un autre
// membre l'avons coché → l'intérêt brut des autres n'est JAMAIS exposé sans
// réciprocité. En plus, « ✓ Réalisé » est un suivi NIVEAU SALON (couple).

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/desires", get(list_desires))
        .route(
            "/api/spaces/{id}/desires/{code}/interest",
            put(set_interest).delete(clear_interest),
        )
        .route(
            "/api/spaces/{id}/desires/{code}/done",
            put(set_done).delete(clear_done),
        )
}

/// Garde commune : membre du salon ET fonctionnalité activée (#99). 403 si
/// désactivée (défense en profondeur ; le front ne propose l'écran que si activée).
async fn ensure_enabled(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    space_id: Uuid,
) -> ApiResult<()> {
    ensure_member(pool, user_id, space_id).await?;
    let enabled: bool =
        sqlx::query_scalar("SELECT desires_enabled FROM spaces WHERE id = $1")
            .bind(space_id)
            .fetch_one(pool)
            .await?;
    if !enabled {
        return Err(ApiError::Forbidden);
    }
    Ok(())
}

/// Catégorie d'un code du catalogue, ou NotFound si inconnu (validation).
fn category_of(code: &str) -> ApiResult<&'static str> {
    desire_category(code).ok_or(ApiError::NotFound)
}

/// Le couple a-t-il marqué ce code « réalisé » ?
async fn is_done(pool: &sqlx::PgPool, space_id: Uuid, code: &str) -> ApiResult<bool> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_done WHERE space_id = $1 AND code = $2)",
    )
    .bind(space_id)
    .bind(code)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

async fn list_desires(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<DesireItem>>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;

    // Mes intérêts + les codes pour lesquels un AUTRE membre a un intérêt (sans
    // jamais dire QUI) : `matched` = intersection (réciprocité). + le set des codes
    // « réalisés » par le couple.
    let mine: HashSet<String> = sqlx::query_scalar(
        "SELECT code FROM desire_interests WHERE space_id = $1 AND user_id = $2",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    let others: HashSet<String> = sqlx::query_scalar(
        "SELECT DISTINCT code FROM desire_interests
         WHERE space_id = $1 AND user_id <> $2",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    let done: HashSet<String> =
        sqlx::query_scalar("SELECT code FROM desire_done WHERE space_id = $1")
            .bind(space_id)
            .fetch_all(&state.pool)
            .await?
            .into_iter()
            .collect();

    // Items dans l'ordre du catalogue (catégorie par catégorie).
    let mut items = Vec::new();
    for (category, codes) in DESIRE_CATEGORIES {
        for &code in *codes {
            let interested = mine.contains(code);
            items.push(DesireItem {
                code: code.to_string(),
                category: category.to_string(),
                interested,
                // Double-aveugle : on ne révèle un match que si JE suis aussi
                // intéressé·e (sinon je découvrirais le secret de l'autre).
                matched: interested && others.contains(code),
                done: done.contains(code),
            });
        }
    }
    Ok(Json(items))
}

/// Vrai si un AUTRE membre est intéressé par ce code (→ match si je le suis aussi).
async fn other_interested(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    me: Uuid,
    code: &str,
) -> ApiResult<bool> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_interests
         WHERE space_id = $1 AND code = $2 AND user_id <> $3)",
    )
    .bind(space_id)
    .bind(code)
    .bind(me)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

async fn set_interest(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;

    let res = sqlx::query(
        "INSERT INTO desire_interests (space_id, user_id, code)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .execute(&state.pool)
    .await?;

    let matched = other_interested(&state.pool, space_id, auth.user_id, &code).await?;

    // Un NOUVEAU match (je viens de cocher, l'autre l'avait déjà) → on prévient le
    // partenaire (event temps réel + push « C'est un match ! »). Pas d'émission si
    // rien n'a changé (re-PUT idempotent) ni si l'autre n'a pas coché (double-aveugle).
    if res.rows_affected() > 0 && matched {
        state.emit(space_id, auth.user_id, EventKind::Desire);
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "C'est un match !".into(),
        );
    }

    Ok(Json(DesireItem {
        code: code.clone(),
        category: category.to_string(),
        interested: true,
        matched,
        done: is_done(&state.pool, space_id, &code).await?,
    }))
}

async fn clear_interest(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;
    sqlx::query(
        "DELETE FROM desire_interests WHERE space_id = $1 AND user_id = $2 AND code = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .execute(&state.pool)
    .await?;
    // Plus intéressé·e → plus de match de mon point de vue (double-aveugle). On
    // n'émet pas d'event : retirer mon intérêt ne doit pas signaler à l'autre.
    Ok(Json(DesireItem {
        code: code.clone(),
        category: category.to_string(),
        interested: false,
        matched: false,
        done: is_done(&state.pool, space_id, &code).await?,
    }))
}

/// « ✓ Réalisé » est NIVEAU SALON (le couple coche). Émet un event pour que
/// l'autre voie le badge — ce n'est pas un secret (≠ l'intérêt double-aveugle).
async fn set_done(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;
    sqlx::query(
        "INSERT INTO desire_done (space_id, code, done_by) VALUES ($1, $2, $3)
         ON CONFLICT (space_id, code) DO NOTHING",
    )
    .bind(space_id)
    .bind(&code)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    state.emit(space_id, auth.user_id, EventKind::Desire);
    Ok(Json(done_view(&state.pool, space_id, auth.user_id, &code, category, true).await?))
}

async fn clear_done(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;
    sqlx::query("DELETE FROM desire_done WHERE space_id = $1 AND code = $2")
        .bind(space_id)
        .bind(&code)
        .execute(&state.pool)
        .await?;
    state.emit(space_id, auth.user_id, EventKind::Desire);
    Ok(Json(done_view(&state.pool, space_id, auth.user_id, &code, category, false).await?))
}

/// Construit la vue d'un item après un toggle « réalisé » : on res, sert l'état
/// d'intérêt/match de l'appelant (inchangé par le done) + le `done` fourni.
async fn done_view(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    me: Uuid,
    code: &str,
    category: &str,
    done: bool,
) -> ApiResult<DesireItem> {
    let interested: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_interests
         WHERE space_id = $1 AND user_id = $2 AND code = $3)",
    )
    .bind(space_id)
    .bind(me)
    .bind(code)
    .fetch_one(pool)
    .await?;
    let matched = interested && other_interested(pool, space_id, me, code).await?;
    Ok(DesireItem {
        code: code.to_string(),
        category: category.to_string(),
        interested,
        matched,
        done,
    })
}
