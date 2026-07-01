use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{desire_category, DesireItem, DESIRE_CATEGORIES};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// Bucket list (#99), optionnelle par salon. Chacun pose un « stance » par item :
// 'want' (envie, DOUBLE-AVEUGLE : révélé seulement en cas de réciprocité) ou
// 'against' (contre = LIMITE, SURFACÉE au couple, bloque le match). Neutre =
// absence de ligne. « ✓ Réalisé » est un suivi niveau salon (couple).

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/desires", get(list_desires))
        .route(
            "/api/spaces/{id}/desires/{code}/stance",
            put(set_stance).delete(clear_stance),
        )
        .route(
            "/api/spaces/{id}/desires/{code}/done",
            put(set_done).delete(clear_done),
        )
}

/// Garde commune : membre du salon ET fonctionnalité activée (#99). 403 si off.
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

async fn list_desires(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<DesireItem>>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;

    // Mon stance par code.
    let my_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT code, stance FROM desire_interests WHERE space_id = $1 AND user_id = $2",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    let my_want: HashSet<&str> = my_rows
        .iter()
        .filter(|(_, s)| s == "want")
        .map(|(c, _)| c.as_str())
        .collect();
    let my_against: HashSet<&str> = my_rows
        .iter()
        .filter(|(_, s)| s == "against")
        .map(|(c, _)| c.as_str())
        .collect();

    // Ce que les AUTRES membres ont posé (sans dire qui) : leurs 'want' (secret,
    // sert au match) et leurs 'against' (surfacés en limite).
    let other_want: HashSet<String> = sqlx::query_scalar(
        "SELECT DISTINCT code FROM desire_interests
         WHERE space_id = $1 AND user_id <> $2 AND stance = 'want'",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    let other_against: HashSet<String> = sqlx::query_scalar(
        "SELECT DISTINCT code FROM desire_interests
         WHERE space_id = $1 AND user_id <> $2 AND stance = 'against'",
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

    let mut items = Vec::new();
    for (category, codes) in DESIRE_CATEGORIES {
        for &code in *codes {
            let interested = my_want.contains(code);
            let against = my_against.contains(code);
            items.push(DesireItem {
                code: code.to_string(),
                category: category.to_string(),
                interested,
                against,
                // Double-aveugle : match seulement si JE veux aussi.
                matched: interested && other_want.contains(code),
                // Surfacé : n'importe quel « contre » = limite du couple.
                limit: against || other_against.contains(code),
                done: done.contains(code),
            });
        }
    }
    Ok(Json(items))
}

/// Reconstruit la vue d'UN item (après un toggle) avec toutes ses facettes.
async fn build_item(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    me: Uuid,
    code: &str,
    category: &str,
) -> ApiResult<DesireItem> {
    let my_stance: Option<String> = sqlx::query_scalar(
        "SELECT stance FROM desire_interests WHERE space_id = $1 AND user_id = $2 AND code = $3",
    )
    .bind(space_id)
    .bind(me)
    .bind(code)
    .fetch_optional(pool)
    .await?;
    let interested = my_stance.as_deref() == Some("want");
    let against = my_stance.as_deref() == Some("against");
    let other_want: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_interests
         WHERE space_id = $1 AND code = $2 AND user_id <> $3 AND stance = 'want')",
    )
    .bind(space_id)
    .bind(code)
    .bind(me)
    .fetch_one(pool)
    .await?;
    let other_against: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_interests
         WHERE space_id = $1 AND code = $2 AND user_id <> $3 AND stance = 'against')",
    )
    .bind(space_id)
    .bind(code)
    .bind(me)
    .fetch_one(pool)
    .await?;
    let done: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM desire_done WHERE space_id = $1 AND code = $2)",
    )
    .bind(space_id)
    .bind(code)
    .fetch_one(pool)
    .await?;
    Ok(DesireItem {
        code: code.to_string(),
        category: category.to_string(),
        interested,
        against,
        matched: interested && other_want,
        limit: against || other_against,
        done,
    })
}

#[derive(Deserialize)]
pub struct StanceBody {
    /// 'want' (envie) ou 'against' (contre / limite).
    pub stance: String,
}

async fn set_stance(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
    Json(body): Json<StanceBody>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;
    if body.stance != "want" && body.stance != "against" {
        return Err(ApiError::BadRequest("stance invalide".into()));
    }

    let prev: Option<String> = sqlx::query_scalar(
        "SELECT stance FROM desire_interests WHERE space_id = $1 AND user_id = $2 AND code = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .fetch_optional(&state.pool)
    .await?;
    sqlx::query(
        "INSERT INTO desire_interests (space_id, user_id, code, stance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (space_id, user_id, code) DO UPDATE SET stance = EXCLUDED.stance",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(&body.stance)
    .execute(&state.pool)
    .await?;

    let item = build_item(&state.pool, space_id, auth.user_id, &code, category).await?;
    let changed = prev.as_deref() != Some(body.stance.as_str());

    if body.stance == "want" {
        // Nouveau match (je viens de vouloir, l'autre voulait déjà) → révèle +
        // push. Uniquement si le stance a changé (pas de re-push idempotent).
        if changed && item.matched {
            state.emit(space_id, auth.user_id, EventKind::Desire);
            crate::notifications::notify_members(
                &state,
                space_id,
                auth.user_id,
                "C'est un match !".into(),
            );
        }
    } else if changed {
        // « Contre » : la limite est SURFACÉE au couple → on rafraîchit l'autre
        // (pas de push : silencieux, ça apparaît à l'écran).
        state.emit(space_id, auth.user_id, EventKind::Desire);
    }

    Ok(Json(item))
}

async fn clear_stance(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    let category = category_of(&code)?;
    let res = sqlx::query(
        "DELETE FROM desire_interests WHERE space_id = $1 AND user_id = $2 AND code = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .execute(&state.pool)
    .await?;
    // Retirer un « contre » (ou un « want » matché) change ce que voit l'autre →
    // on rafraîchit. (Un « want » privé non matché n'expose rien : refetch inoffensif.)
    if res.rows_affected() > 0 {
        state.emit(space_id, auth.user_id, EventKind::Desire);
    }
    Ok(Json(
        build_item(&state.pool, space_id, auth.user_id, &code, category).await?,
    ))
}

/// « ✓ Réalisé » est NIVEAU SALON (le couple coche). Émet un event (badge partagé,
/// ≠ secret).
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
    Ok(Json(
        build_item(&state.pool, space_id, auth.user_id, &code, category).await?,
    ))
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
    Ok(Json(
        build_item(&state.pool, space_id, auth.user_id, &code, category).await?,
    ))
}
