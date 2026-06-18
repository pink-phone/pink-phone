use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{Mood, MOODS};
use crate::routes::ensure_member;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/mood", put(set_mood).delete(clear_mood))
        .route("/api/spaces/{id}/moods", get(list_moods))
}

#[derive(Deserialize)]
pub struct SetMoodBody {
    pub status: String,
}

/// Mood accepté : soit un prédéfini, soit une humeur « libre » bornée. Le format
/// libre est « emoji [label] » (l'emoji puis un libellé court optionnel), stocké
/// dans le même champ TEXT — on borne juste la longueur, le contenu reste libre.
fn mood_allowed(s: &str) -> bool {
    if MOODS.contains(&s) {
        return true;
    }
    let t = s.trim();
    let n = t.chars().count();
    n >= 1 && n <= 40 && t.len() <= 120
}

async fn set_mood(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
    Json(body): Json<SetMoodBody>,
) -> ApiResult<Json<Mood>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    if !mood_allowed(&body.status) {
        return Err(ApiError::BadRequest("humeur invalide".into()));
    }

    let mood: Mood = sqlx::query_as(
        "INSERT INTO moods (user_id, space_id, status, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, space_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = now()
         RETURNING user_id, status, updated_at",
    )
    .bind(auth.user_id)
    .bind(space_id)
    .bind(&body.status)
    .fetch_one(&state.pool)
    .await?;

    state.emit(space_id, auth.user_id, "mood");

    // Une humeur « chaude » ou « taquine » fait signe au/à la partenaire (même
    // si l'humeur est renvoyée à l'identique).
    let nudge = match body.status.as_str() {
        "veryHot" => Some("🔥 Très chaud·e en ce moment…"),
        "flirty" => Some("😏 D'humeur taquine…"),
        _ => None,
    };
    if let Some(msg) = nudge {
        // En mode « vote à l'aveugle », la notif ne part que lorsque TOUT LE MONDE
        // a voté aujourd'hui : impossible de dévoiler l'humeur à quelqu'un qui n'a
        // pas encore posé la sienne (option simple, sans replay de l'humeur du 1er).
        let blind: bool = sqlx::query_scalar("SELECT blind_mood FROM spaces WHERE id = $1")
            .bind(space_id)
            .fetch_one(&state.pool)
            .await?;
        let everyone_voted: bool = !blind
            || sqlx::query_scalar(
                "SELECT (SELECT count(*) FROM space_memberships WHERE space_id = $1)
                      <= (SELECT count(DISTINCT m.user_id) FROM moods m
                          JOIN spaces s ON s.id = m.space_id
                          WHERE m.space_id = $1
                            AND (m.updated_at AT TIME ZONE s.timezone)::date
                                = (now() AT TIME ZONE s.timezone)::date)",
            )
            .bind(space_id)
            .fetch_one(&state.pool)
            .await?;
        if everyone_voted {
            crate::notifications::notify_members(
                &state,
                space_id,
                auth.user_id,
                "Nouvelle humeur".into(),
                msg.into(),
            );
        }
    }

    Ok(Json(mood))
}

/// Retire mon humeur (désélection). Idempotent. Émet un event pour resync — en
/// « surprise mutuelle », ça re-masque l'humeur du partenaire (je n'ai plus voté).
async fn clear_mood(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;
    sqlx::query("DELETE FROM moods WHERE user_id = $1 AND space_id = $2")
        .bind(auth.user_id)
        .bind(space_id)
        .execute(&state.pool)
        .await?;
    state.emit(space_id, auth.user_id, "mood");
    Ok(StatusCode::NO_CONTENT)
}

async fn list_moods(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Mood>>> {
    ensure_member(&state.pool, auth.user_id, space_id).await?;

    // La "météo du jour" : un mood se périme au passage de minuit DANS LE FUSEAU
    // DU SALON (et non après une fenêtre glissante de 24h). On ne renvoie donc que
    // les humeurs posées le jour calendaire courant ; au-delà, l'utilisateur est
    // réinvité à la poser.
    let moods: Vec<Mood> = sqlx::query_as(
        "SELECT m.user_id, m.status, m.updated_at
         FROM moods m
         JOIN spaces s ON s.id = m.space_id
         WHERE m.space_id = $1
           AND (m.updated_at AT TIME ZONE s.timezone)::date
               = (now() AT TIME ZONE s.timezone)::date",
    )
    .bind(space_id)
    .fetch_all(&state.pool)
    .await?;

    // Vote à l'aveugle : tant que JE n'ai pas posé mon humeur du jour, je ne dois
    // pas connaître celle des autres — mais je peux savoir QU'ILS ont voté (pour
    // afficher un cache « humeur en attente »). On garde donc les entrées des
    // autres mais on vide leur `status` (la valeur reste secrète jusqu'à mon vote).
    let blind: bool = sqlx::query_scalar("SELECT blind_mood FROM spaces WHERE id = $1")
        .bind(space_id)
        .fetch_one(&state.pool)
        .await?;
    if blind && !moods.iter().any(|m| m.user_id == auth.user_id) {
        let redacted = moods
            .into_iter()
            .map(|mut m| {
                if m.user_id != auth.user_id {
                    m.status = String::new();
                }
                m
            })
            .collect();
        return Ok(Json(redacted));
    }
    Ok(Json(moods))
}
