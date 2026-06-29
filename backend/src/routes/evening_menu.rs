use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use chrono::NaiveDate;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{EveningMenuItem, EVENING_MENU_CODES};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// « Menu du soir » (#97b) : rituel QUOTIDIEN à double consentement, optionnel par
// salon. Chacun coche en privé des envies « pour ce soir » ; un item n'est révélé
// (« Match ! ») que si les deux l'ont coché LE MÊME JOUR. Le « jour » est le jour
// calendaire local du salon (fuseau), comme le mood → le menu se vide à minuit.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/evening-menu", get(list_menu))
        .route(
            "/api/spaces/{id}/evening-menu/{code}",
            put(pick).delete(unpick),
        )
}

/// Garde commune : membre du salon ET menu activé. Renvoie le JOUR local du salon
/// (fuseau) — la fenêtre « ce soir ». 403 si désactivé (défense en profondeur).
async fn ensure_enabled_today(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    space_id: Uuid,
) -> ApiResult<NaiveDate> {
    ensure_member(pool, user_id, space_id).await?;
    let row: Option<(bool, NaiveDate)> = sqlx::query_as(
        "SELECT evening_menu_enabled, (now() AT TIME ZONE timezone)::date
         FROM spaces WHERE id = $1",
    )
    .bind(space_id)
    .fetch_optional(pool)
    .await?;
    let (enabled, today) = row.ok_or(ApiError::NotFound)?;
    if !enabled {
        return Err(ApiError::Forbidden);
    }
    Ok(today)
}

fn check_code(code: &str) -> ApiResult<()> {
    if EVENING_MENU_CODES.contains(&code) {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

async fn list_menu(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<EveningMenuItem>>> {
    let today = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;

    let mine: HashSet<String> = sqlx::query_scalar(
        "SELECT code FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND day = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(today)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    let others: HashSet<String> = sqlx::query_scalar(
        "SELECT DISTINCT code FROM evening_menu_picks
         WHERE space_id = $1 AND user_id <> $2 AND day = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(today)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();

    let items = EVENING_MENU_CODES
        .iter()
        .map(|&code| {
            let picked = mine.contains(code);
            EveningMenuItem {
                code: code.to_string(),
                picked,
                // Double-aveugle : match seulement si JE l'ai coché aussi.
                matched: picked && others.contains(code),
            }
        })
        .collect();
    Ok(Json(items))
}

/// Vrai si un AUTRE membre a coché ce code aujourd'hui (→ match si je le coche).
async fn other_picked(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    me: Uuid,
    code: &str,
    today: NaiveDate,
) -> ApiResult<bool> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM evening_menu_picks
         WHERE space_id = $1 AND code = $2 AND user_id <> $3 AND day = $4)",
    )
    .bind(space_id)
    .bind(code)
    .bind(me)
    .bind(today)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

async fn pick(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<EveningMenuItem>> {
    let today = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    check_code(&code)?;

    let res = sqlx::query(
        "INSERT INTO evening_menu_picks (space_id, user_id, code, day)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .execute(&state.pool)
    .await?;

    let matched = other_picked(&state.pool, space_id, auth.user_id, &code, today).await?;

    // Nouveau match du soir → on révèle de l'autre côté (WS) + push « C'est un
    // match ce soir ! ». Pas d'émission sinon (double-aveugle / re-PUT idempotent).
    if res.rows_affected() > 0 && matched {
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "C'est un match ce soir !".into(),
        );
    }

    Ok(Json(EveningMenuItem {
        code,
        picked: true,
        matched,
    }))
}

async fn unpick(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<EveningMenuItem>> {
    let today = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    check_code(&code)?;
    sqlx::query(
        "DELETE FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND code = $3 AND day = $4",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .execute(&state.pool)
    .await?;
    Ok(Json(EveningMenuItem {
        code,
        picked: false,
        matched: false,
    }))
}

/// Purge des coches de plus de 2 jours (le menu n'est pertinent que pour son jour
/// local ; 2 jours couvrent les écarts de fuseau). Best-effort.
pub async fn purge_old_picks(pool: &sqlx::PgPool) {
    match sqlx::query(
        "DELETE FROM evening_menu_picks WHERE created_at < now() - interval '2 days'",
    )
    .execute(pool)
    .await
    {
        Ok(res) if res.rows_affected() > 0 => {
            tracing::info!(count = res.rows_affected(), "menus du soir périmés purgés");
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = ?e, "purge des menus du soir échouée"),
    }
}
