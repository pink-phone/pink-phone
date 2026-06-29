use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{DesireItem, DESIRE_CODES};
use crate::routes::ensure_member;
use crate::state::{AppState, EventKind};

// Liste d'envies à double consentement (#99), optionnelle par salon. Le catalogue
// = const `DESIRE_CODES` (libellés rendus côté front via i18n). Chacun coche en
// privé ; un code n'est « matché » que si MOI ET un autre membre l'avons coché →
// l'intérêt brut des autres n'est JAMAIS exposé tant qu'il n'y a pas réciprocité.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/desires", get(list_desires))
        .route(
            "/api/spaces/{id}/desires/{code}/interest",
            put(set_interest).delete(clear_interest),
        )
}

/// Garde commune : membre du salon ET fonctionnalité activée (#99). Renvoie 403
/// si la liste d'envies est désactivée (le front ne propose l'écran que si elle
/// l'est ; garde de défense en profondeur).
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

/// Valide qu'un code appartient bien au catalogue (sinon NotFound).
fn check_code(code: &str) -> ApiResult<()> {
    if DESIRE_CODES.contains(&code) {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

async fn list_desires(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<DesireItem>>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;

    // Mes intérêts + les codes pour lesquels un AUTRE membre a un intérêt (sans
    // jamais dire QUI) : `matched` = intersection des deux (réciprocité).
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

    let items = DESIRE_CODES
        .iter()
        .map(|&code| {
            let interested = mine.contains(code);
            DesireItem {
                code: code.to_string(),
                interested,
                // Double-aveugle : on ne révèle un match que si JE suis aussi
                // intéressé·e (sinon je découvrirais le secret de l'autre sans
                // engager le mien).
                matched: interested && others.contains(code),
            }
        })
        .collect();
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
    check_code(&code)?;

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
    // partenaire (event temps réel pour révéler le match de SON côté + push « C'est
    // un match ! »). Pas d'émission si rien n'a changé (re-PUT idempotent) ni si
    // l'autre n'a pas coché (double-aveugle : son écran ne doit pas bouger).
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
        code,
        interested: true,
        matched,
    }))
}

async fn clear_interest(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<DesireItem>> {
    ensure_enabled(&state.pool, auth.user_id, space_id).await?;
    check_code(&code)?;
    sqlx::query(
        "DELETE FROM desire_interests WHERE space_id = $1 AND user_id = $2 AND code = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .execute(&state.pool)
    .await?;
    // Plus intéressé·e → plus de match de mon point de vue (double-aveugle). On
    // n'émet pas d'event : retirer mon intérêt ne doit pas signaler à l'autre que
    // j'avais coché (son écran ne révélait rien tant qu'il n'avait pas matché).
    Ok(Json(DesireItem {
        code,
        interested: false,
        matched: false,
    }))
}
