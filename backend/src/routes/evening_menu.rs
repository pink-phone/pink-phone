use std::collections::{HashMap, HashSet};

use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use chrono::NaiveDate;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{CatalogItemRow, EveningMenuItem};
use crate::routes::ensure_member;
use crate::routes::spaces::parse_course_category;
use crate::state::{AppState, EventKind};

// « Menu du soir » (#97b) : rituel QUOTIDIEN, optionnel par salon. Le contenu
// vient du catalogue partagé (#0033). Chaque service (Entrée/Plat/Dessert) est
// alimenté par des CATÉGORIES : défaut = `catalog_items.evening_course` (#0039),
// paramétrable par salon en sélection multiple (`spaces.evening_course_categories`,
// #0043 : pour chaque service, les catégories qui l'alimentent). On peut
// aussi choisir un item HORS des catégories d'un service : le service est alors
// mémorisé avec le choix (`evening_menu_picks.course`). Tout item actif est
// éligible, sauf le prompt rotatif « nouvelle position du mois ».
//
// Deux modes, au choix du salon (`spaces.evening_menu_blind`, #0040) :
// - AVEUGLE (défaut, INCHANGÉ) : mon choix reste privé ; un item n'est révélé
//   que si l'autre a AUSSI coché « want » le même jour (match mutuel).
// - OUVERT : dès que l'un coche « want », l'autre le voit tout de suite et
//   peut valider (poser son propre « want ») ou refuser. Un seul statut
//   visuel (`matched`, même glow) : sur le menu ce soir si l'un des deux veut
//   ET qu'aucun des deux n'a refusé — silence de l'autre côté = inclus par
//   défaut (pas de refus = pas d'exclusion).

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces/{id}/evening-menu", get(list_menu))
        .route(
            "/api/spaces/{id}/evening-menu/{code}",
            put(pick).delete(unpick),
        )
        .route("/api/spaces/{id}/evening-menu-status", get(menu_status))
        .route(
            "/api/spaces/{id}/evening-menu-done",
            put(mark_done).delete(unmark_done),
        )
}

/// Contexte d'une requête du menu du soir (garde + état du jour).
struct MenuCtx {
    blind: bool,
    today: NaiveDate,
    map: CourseMap,
    /// Mode aveugle ET tous les membres ont validé ce soir → les choix de
    /// chacun sont dévoilés, matchés ou non.
    revealed: bool,
    /// J'ai validé mon menu de ce soir (mode aveugle : mes choix sont verrouillés).
    me_done: bool,
    done_count: i64,
    member_count: i64,
}

/// Classement du salon : catégorie → services qu'elle alimente, dans l'ordre du
/// repas. `None` = classement du catalogue (par item), tant que le salon n'a pas
/// paramétré.
type CourseMap = Option<HashMap<String, Vec<String>>>;

const COURSE_ORDER: [&str; 3] = ["starter", "main", "dessert"];

fn course_map(custom: bool, entries: &[String]) -> CourseMap {
    if !custom {
        return None;
    }
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for (service, category) in entries.iter().filter_map(|e| parse_course_category(e)) {
        map.entry(category.to_string()).or_default().push(service.to_string());
    }
    for services in map.values_mut() {
        services.sort_by_key(|s| COURSE_ORDER.iter().position(|c| c == s));
        services.dedup();
    }
    Some(map)
}

/// Garde commune : membre du salon ET menu activé. Renvoie le mode aveugle du
/// salon, le JOUR local (fuseau) — la fenêtre « ce soir » — et les surcharges
/// catégorie → service du salon. 403 si désactivé
/// (défense en profondeur).
async fn ensure_enabled_today(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    space_id: Uuid,
) -> ApiResult<MenuCtx> {
    ensure_member(pool, user_id, space_id).await?;
    let row: Option<(bool, bool, NaiveDate, bool, Vec<String>)> = sqlx::query_as(
        "SELECT evening_menu_enabled, evening_menu_blind, (now() AT TIME ZONE timezone)::date,
                evening_course_custom, evening_course_categories
         FROM spaces WHERE id = $1",
    )
    .bind(space_id)
    .fetch_optional(pool)
    .await?;
    let (enabled, blind, today, custom, entries) = row.ok_or(ApiError::NotFound)?;
    if !enabled {
        return Err(ApiError::Forbidden);
    }
    let (member_count, done_count, me_done): (i64, i64, bool) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM space_memberships WHERE space_id = $1),
                (SELECT count(*) FROM evening_menu_done WHERE space_id = $1 AND day = $2),
                EXISTS (SELECT 1 FROM evening_menu_done
                        WHERE space_id = $1 AND day = $2 AND user_id = $3)",
    )
    .bind(space_id)
    .bind(today)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(MenuCtx {
        blind,
        today,
        map: course_map(custom, &entries),
        revealed: blind && member_count > 0 && done_count >= member_count,
        me_done,
        done_count,
        member_count,
    })
}

const CATALOG_ITEM_COLUMNS: &str = "
    ci.id, ci.category_id,
    cc.label_fr AS category_label_fr, cc.label_en AS category_label_en,
    ci.subcategory, ci.label_fr, ci.label_en, ci.label_fr_soft, ci.label_en_soft,
    ci.description_fr, ci.description_en, ci.intensity, ci.evening_course";

/// Le prompt rotatif n'est pas un choix pour CE soir.
const EXCLUDED_ITEM: &str = "positions-new-monthly";

/// Item actif du catalogue, éligible au menu du soir — NotFound sinon
/// (désactivé / prompt rotatif = validation).
async fn catalog_item(pool: &sqlx::PgPool, code: &str) -> ApiResult<CatalogItemRow> {
    sqlx::query_as::<_, CatalogItemRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {CATALOG_ITEM_COLUMNS}
         FROM catalog_items ci JOIN catalog_categories cc ON cc.id = ci.category_id
         WHERE ci.id = $1 AND ci.active AND ci.id <> $2"
    )))
    .bind(code)
    .bind(EXCLUDED_ITEM)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// Dérive (picked, matched, partnerWants, refused) selon le mode du salon.
/// Aveugle : le choix de l'autre n'entre jamais dans `partner_wants`/`refused`
/// (toujours faux) — `matched` exige les deux `want` — SAUF une fois les menus
/// dévoilés (`revealed`, tous les membres ont validé) : `partner_wants` montre
/// alors aussi les choix non matchés. Ouvert : `matched` =
/// (moi OU l'autre) `want`, ET personne n'a `refused` ; silence = inclus.
fn compute_flags(
    blind: bool,
    my_stance: Option<&str>,
    other_wants: bool,
    other_refused: bool,
    revealed: bool,
) -> (bool, bool, bool, bool) {
    let picked = my_stance == Some("want");
    if blind {
        (picked, picked && other_wants, revealed && other_wants, false)
    } else {
        let my_refused = my_stance == Some("refused");
        let refused = my_refused || other_refused;
        let matched = (picked || other_wants) && !refused;
        (picked, matched, other_wants, refused)
    }
}

/// Services où un item est proposé : ceux de sa catégorie dans le classement du
/// salon, sinon son service par défaut du catalogue (aucun = vide).
fn eligible_courses(row: &CatalogItemRow, map: &CourseMap) -> Vec<String> {
    match map {
        Some(m) => m.get(&row.category_id).cloned().unwrap_or_default(),
        None => row.evening_course.iter().cloned().collect(),
    }
}

/// (service affiché, services proposés) : le service affiché est celui où un
/// choix a été ajouté (le mien d'abord, puis celui d'un autre membre), sinon le
/// premier service proposé, sinon vide (aucun service — reste choisissable via
/// « Tout le catalogue »).
fn resolve_course(
    row: &CatalogItemRow,
    map: &CourseMap,
    my_course: Option<&str>,
    other_course: Option<&str>,
) -> (String, Vec<String>) {
    let courses = eligible_courses(row, map);
    let shown = my_course
        .or(other_course)
        .map(str::to_string)
        .or_else(|| courses.first().cloned())
        .unwrap_or_default();
    (shown, courses)
}

/// Choix (want/refused) des AUTRES membres du salon pour ce code, ce jour —
/// agrégés (un « refused » de n'importe qui bloque, comme la limite #99) — et
/// le service qu'ils lui ont donné, le cas échéant.
async fn partner_flags(
    pool: &sqlx::PgPool,
    space_id: Uuid,
    me: Uuid,
    code: &str,
    today: NaiveDate,
) -> ApiResult<(bool, bool, Option<String>)> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT stance, course FROM evening_menu_picks
         WHERE space_id = $1 AND code = $2 AND user_id <> $3 AND day = $4",
    )
    .bind(space_id)
    .bind(code)
    .bind(me)
    .bind(today)
    .fetch_all(pool)
    .await?;
    let other_wants = rows.iter().any(|(s, _)| s == "want");
    let other_refused = rows.iter().any(|(s, _)| s == "refused");
    let other_course = rows.into_iter().find_map(|(_, c)| c);
    Ok((other_wants, other_refused, other_course))
}

async fn list_menu(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<Vec<EveningMenuItem>>> {
    let MenuCtx { blind, today, map, revealed, .. } =
        ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;

    // Tout le catalogue actif : c'est le client qui filtre par service (le
    // sélecteur peut piocher hors catégorie). Les items déjà du menu par défaut
    // d'abord, puis l'ordre du catalogue.
    let rows: Vec<CatalogItemRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {CATALOG_ITEM_COLUMNS}
         FROM catalog_items ci JOIN catalog_categories cc ON cc.id = ci.category_id
         WHERE ci.active AND ci.id <> $1
         ORDER BY cc.sort_order, ci.sort_order"
    )))
    .bind(EXCLUDED_ITEM)
    .fetch_all(&state.pool)
    .await?;

    let my_rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT code, stance, course FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND day = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(today)
    .fetch_all(&state.pool)
    .await?;
    let my: HashMap<String, (String, Option<String>)> = my_rows
        .into_iter()
        .map(|(code, stance, course)| (code, (stance, course)))
        .collect();

    let other_rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT code, stance, course FROM evening_menu_picks
         WHERE space_id = $1 AND user_id <> $2 AND day = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(today)
    .fetch_all(&state.pool)
    .await?;
    let mut other_want: HashSet<String> = HashSet::new();
    let mut other_refused: HashSet<String> = HashSet::new();
    let mut other_course: HashMap<String, String> = HashMap::new();
    for (code, stance, course) in other_rows {
        if let Some(c) = course {
            other_course.entry(code.clone()).or_insert(c);
        }
        if stance == "want" {
            other_want.insert(code);
        } else {
            other_refused.insert(code);
        }
    }

    let items = rows
        .into_iter()
        .map(|row| {
            let my_stance = my.get(&row.id).map(|(s, _)| s.as_str());
            let (picked, matched, partner_wants, refused) = compute_flags(
                blind,
                my_stance,
                other_want.contains(&row.id),
                other_refused.contains(&row.id),
                revealed,
            );
            let (course, courses) = resolve_course(
                &row,
                &map,
                my.get(&row.id).and_then(|(_, c)| c.as_deref()),
                // Le service donné par l'autre à son choix n'est révélé qu'avec le
                // choix lui-même (mode ouvert) ou le match (aveugle) — sinon il
                // trahirait un choix secret.
                other_course
                    .get(&row.id)
                    .map(String::as_str)
                    .filter(|_| partner_wants || matched),
            );
            let mut item = EveningMenuItem::from_catalog(row);
            item.course = course;
            item.courses = courses;
            item.picked = picked;
            item.matched = matched;
            item.partner_wants = partner_wants;
            item.refused = refused;
            item
        })
        .collect();
    Ok(Json(items))
}

#[derive(Deserialize, Default)]
pub struct PickBody {
    /// 'want' (défaut) ou 'refused' — 'refused' uniquement disponible en
    /// mode ouvert (#0040).
    pub stance: Option<String>,
    /// Service où le choix est ajouté (starter|main|dessert) — permet de
    /// piocher hors des catégories du service. Absent = service par défaut.
    pub course: Option<String>,
}

async fn pick(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
    body: Option<Json<PickBody>>,
) -> ApiResult<Json<EveningMenuItem>> {
    let MenuCtx { blind, today, map, revealed, me_done, .. } =
        ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    if blind && me_done {
        return Err(ApiError::Conflict("menu du soir déjà validé".into()));
    }
    let row = catalog_item(&state.pool, &code).await?;
    let body = body.map(|Json(b)| b).unwrap_or_default();
    let course = match body.course.as_deref() {
        Some(c @ ("starter" | "main" | "dessert")) => Some(c),
        None => None,
        Some(_) => return Err(ApiError::BadRequest("service invalide".into())),
    };

    let stance = match body.stance.as_deref() {
        Some("refused") => "refused",
        Some("want") | None => "want",
        Some(_) => return Err(ApiError::BadRequest("stance invalide".into())),
    };
    if blind && stance == "refused" {
        return Err(ApiError::BadRequest(
            "refus indisponible en mode aveugle".into(),
        ));
    }

    let prev: Option<String> = sqlx::query_scalar(
        "SELECT stance FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND code = $3 AND day = $4",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .fetch_optional(&state.pool)
    .await?;

    sqlx::query(
        "INSERT INTO evening_menu_picks (space_id, user_id, code, day, stance, course)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (space_id, user_id, code, day) DO UPDATE
             SET stance = EXCLUDED.stance,
                 course = COALESCE(EXCLUDED.course, evening_menu_picks.course)",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .bind(stance)
    .bind(course)
    .execute(&state.pool)
    .await?;

    let my_course: Option<String> = sqlx::query_scalar(
        "SELECT course FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND code = $3 AND day = $4",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .fetch_one(&state.pool)
    .await?;

    let (other_wants, other_refused, other_course) =
        partner_flags(&state.pool, space_id, auth.user_id, &code, today).await?;
    let (picked, matched, partner_wants, refused) =
        compute_flags(blind, Some(stance), other_wants, other_refused, revealed);
    let changed = prev.as_deref() != Some(stance);

    // Nouveau match (aveugle : réciprocité ; ouvert : je valide une
    // proposition, ou l'autre en pose une nouvelle sur un item que je
    // voulais déjà) → révèle + push. Uniquement si le stance a changé (pas de
    // re-push idempotent).
    if changed && matched {
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "eveningMenu",
            Some(&code),
            None,
            "C'est un match ce soir !".into(),
        )
        .await;
    } else if changed && !blind {
        // Mode ouvert : ma proposition/mon refus change ce que l'autre voit
        // → on rafraîchit (pas de push : silencieux, ça apparaît à l'écran).
        // En mode aveugle, JAMAIS : un évènement trahirait qu'un choix a bougé.
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
    }

    // Service de l'autre : seulement s'il est révélé (cf. list_menu).
    let other_course = other_course.filter(|_| partner_wants || matched);
    let (course, courses) =
        resolve_course(&row, &map, my_course.as_deref(), other_course.as_deref());
    let mut item = EveningMenuItem::from_catalog(row);
    item.course = course;
    item.courses = courses;
    item.picked = picked;
    item.matched = matched;
    item.partner_wants = partner_wants;
    item.refused = refused;
    Ok(Json(item))
}

async fn unpick(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((space_id, code)): Path<(Uuid, String)>,
) -> ApiResult<Json<EveningMenuItem>> {
    let MenuCtx { blind, today, map, revealed, me_done, .. } =
        ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    if blind && me_done {
        return Err(ApiError::Conflict("menu du soir déjà validé".into()));
    }
    let row = catalog_item(&state.pool, &code).await?;
    let res = sqlx::query(
        "DELETE FROM evening_menu_picks
         WHERE space_id = $1 AND user_id = $2 AND code = $3 AND day = $4",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(&code)
    .bind(today)
    .execute(&state.pool)
    .await?;

    let (other_wants, other_refused, other_course) =
        partner_flags(&state.pool, space_id, auth.user_id, &code, today).await?;
    let (picked, matched, partner_wants, refused) =
        compute_flags(blind, None, other_wants, other_refused, revealed);
    // Aveugle : seul un match défait change ce que l'autre voit (il voulait aussi
    // cet item) ; sinon un évènement trahirait le retrait d'un choix secret.
    if res.rows_affected() > 0 && (!blind || other_wants) {
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
    }

    let other_course = other_course.filter(|_| partner_wants || matched);
    let (course, courses) = resolve_course(&row, &map, None, other_course.as_deref());
    let mut item = EveningMenuItem::from_catalog(row);
    item.course = course;
    item.courses = courses;
    item.picked = picked;
    item.matched = matched;
    item.partner_wants = partner_wants;
    item.refused = refused;
    Ok(Json(item))
}

/// État de la validation du menu du soir (mode aveugle) pour CE soir.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MenuStatus {
    /// J'ai validé mon menu (mes choix sont verrouillés).
    me_done: bool,
    /// Combien de membres ont validé / combien il y en a.
    done_count: i64,
    member_count: i64,
    /// Tous ont validé : les choix de chacun sont dévoilés, matchés ou non.
    revealed: bool,
}

impl From<&MenuCtx> for MenuStatus {
    fn from(c: &MenuCtx) -> Self {
        Self {
            me_done: c.me_done,
            done_count: c.done_count,
            member_count: c.member_count,
            revealed: c.revealed,
        }
    }
}

async fn menu_status(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<MenuStatus>> {
    let ctx = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    Ok(Json(MenuStatus::from(&ctx)))
}

/// « J'ai fini » : valide mon menu de ce soir (mode aveugle). Idempotent. Quand
/// tout le monde a validé, les choix de chacun sont dévoilés.
async fn mark_done(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<MenuStatus>> {
    let ctx = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    if !ctx.blind {
        return Err(ApiError::BadRequest(
            "validation indisponible en mode ouvert".into(),
        ));
    }
    let res = sqlx::query(
        "INSERT INTO evening_menu_done (space_id, user_id, day) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(ctx.today)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() > 0 {
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
    }
    let ctx = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    // Dernier à valider : les menus sont dévoilés → on prévient les autres (qui
    // avaient fini avant). Corps générique côté push : aucun choix ne fuit.
    if res.rows_affected() > 0 && ctx.revealed {
        crate::notifications::notify_members(
            &state,
            space_id,
            auth.user_id,
            "eveningMenuRevealed",
            None,
            None,
            "Les menus du soir sont dévoilés !".into(),
        )
        .await;
    }
    Ok(Json(MenuStatus::from(&ctx)))
}

/// Retire ma validation (je veux encore modifier) — impossible une fois que
/// tout le monde a validé (les menus sont alors dévoilés, définitivement).
async fn unmark_done(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(space_id): Path<Uuid>,
) -> ApiResult<Json<MenuStatus>> {
    let ctx = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    if ctx.revealed {
        return Err(ApiError::Conflict(
            "menus déjà dévoilés pour ce soir".into(),
        ));
    }
    let res = sqlx::query(
        "DELETE FROM evening_menu_done WHERE space_id = $1 AND user_id = $2 AND day = $3",
    )
    .bind(space_id)
    .bind(auth.user_id)
    .bind(ctx.today)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() > 0 {
        state.emit(space_id, auth.user_id, EventKind::EveningMenu);
    }
    let ctx = ensure_enabled_today(&state.pool, auth.user_id, space_id).await?;
    Ok(Json(MenuStatus::from(&ctx)))
}

/// Purge des coches de plus de 2 jours (le menu n'est pertinent que pour son jour
/// local ; 2 jours couvrent les écarts de fuseau). Best-effort.
pub async fn purge_old_picks(pool: &sqlx::PgPool) {
    let _ = sqlx::query("DELETE FROM evening_menu_done WHERE created_at < now() - interval '2 days'")
        .execute(pool)
        .await;
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
