# Security findings — PinkPhone

Confirmed findings from white-hat reviews, per the format in `~/.claude/CLAUDE.md` §4 and
the scope in [CLAUDE.md](CLAUDE.md) → "Security review scope (white-hat)". One entry per
finding, appended in date order. Status kept up to date as issues are fixed.

---

## 2026-09-01 — Static review of `backend/`

Reviewer: Claude (white-hat static review, Mode A). Full `backend/src/` read (routes, auth,
config, models, notifications) against the priority attack-surface list in CLAUDE.md. No
dynamic testing performed (no confirmed target host).

### 1. No rate limiting on space-invite redemption — brute-forceable invite codes

- **Status**: fixed (2026-09-01) — [backend/src/rate_limit.rs](backend/src/rate_limit.rs) + [backend/src/routes/spaces.rs](backend/src/routes/spaces.rs) (`join_by_invite`)
- **Location**: [backend/src/routes/spaces.rs:280](backend/src/routes/spaces.rs#L280) (`join_by_invite`, `POST /api/spaces/join`)
- **Class**: CWE-307 (Improper Restriction of Excessive Authentication Attempts) / CWE-799
- **Severity**: Medium–High (deployment-dependent) — no confirmed CVSS, code-level analysis only
- **Confidence**: likely (verified by call-path tracing; not yet dynamically exploited)

**Finding**: `space_invites.code` is drawn from a keyspace of 32 × 32 × 10 = 10,240 possible
values ([backend/src/invite_code.rs](backend/src/invite_code.rs)). `join_by_invite` takes only
the code — not a target `space_id` — and requires nothing but a valid JWT (any registered
account) to attempt redemption. No route in the backend applies any per-IP or per-account rate
limiting, lockout, or backoff (confirmed: no `tower_governor`/rate-limit crate in
`backend/Cargo.toml`, no rate-limit layer in `main.rs`, no `limit_req` in
`frontend/nginx.conf`).

An attacker with any account on the instance can therefore sweep the entire ~10k-code space
against `/api/spaces/join` and will match **any** currently-active invite anywhere on that
instance — not just one targeted space. `create_invite` reuses an active code across reloads
(idempotent, 7-day expiry, ≤10 active invites/space), so a real invite is "live" for a
meaningful fraction of normal usage (any time a user has the invite screen generated and
hasn't been joined yet).

**Impact**: successful redemption makes the attacker a full member of someone else's space —
read/write access to that couple's posts, moods, challenges, comments, and media (the app's
most sensitive content), indistinguishable from a real partner once joined.

**Preconditions**: (a) the attacker can create/hold an account on the same instance — true by
default when `PASSWORD_AUTH_ENABLED` is unset/true; (b) at least one active invite exists
anywhere on the instance at attack time. On a single-couple self-hosted instance with no
outside registration, exposure is low. On any instance hosting multiple spaces (shared/friend-
group deployment, or open registration), exposure is real and does not require targeting a
specific couple.

**Remediation**:
- Add rate limiting on `POST /api/spaces/join`, keyed by IP and by account (e.g. `tower_governor`
  in Rust, or `limit_req_zone` in `frontend/nginx.conf` alongside the existing `/api/` block).
- Add a failed-attempt counter with backoff/lockout per account and per IP.
- Consider defense-in-depth: widen the code's effective entropy for deployments expected to
  host multiple spaces (e.g. a longer digit suffix), while keeping the short human-readable
  code as the default for single-couple self-hosts.
- Log repeated invalid-code join attempts (currently a silent generic 400) so an ongoing sweep
  is visible in `tracing`/alerts.

**Fix applied**: in-process sliding-window rate limiter ([backend/src/rate_limit.rs](backend/src/rate_limit.rs)),
keyed by **both** client IP (`X-Real-IP`, trusted only because it's set by our own nginx —
see the caveat in that file — with a `ConnectInfo` fallback for direct/dev access) and the
authenticated `user_id`, 8 attempts/60s each, checked before any DB lookup. Returns
`429 too_many_requests` (new `ApiError::TooManyRequests` variant). Covered by an end-to-end
integration test (`join_rate_limite_apres_n_tentatives`) plus unit tests on the limiter itself.
Not done (left as future work, see remediation bullets above): widening code entropy,
alerting on sweeps, and the log-suggested audit trail.

---

### 2. No rate limiting on login/register — credential-stuffing and pool-exhaustion exposure

- **Status**: fixed (2026-09-01) — [backend/src/routes/auth.rs](backend/src/routes/auth.rs) (`login`, `register`)
- **Location**: [backend/src/routes/auth.rs:45](backend/src/routes/auth.rs#L45) (`register`), [backend/src/routes/auth.rs:84](backend/src/routes/auth.rs#L84) (`login`)
- **Class**: CWE-307; secondary CWE-770 (Uncontrolled Resource Consumption)
- **Severity**: Low–Medium
- **Confidence**: likely

**Finding**: same root cause as #1 — no rate limiting anywhere in the stack. `login` and
`register` are already hardened against timing-based user enumeration (constant-time dummy
hash, SEC-010/SEC-011) and passwords are Argon2id-hashed (~100–500 ms/attempt), which provides
*some* natural throttling, but nothing prevents parallelizing attempts across connections up to
the pool's `max_connections(10)`. `register` only requires an 8-character minimum password with
no complexity/breach-list check, so weak passwords are guessable at sustained volume.

**Impact**: credential-stuffing / password-guessing against known or guessed emails; a
sustained attack also risks exhausting the 10-connection Postgres pool (`acquire_timeout` 10s),
denying service to legitimate users on that same instance.

**Remediation**:
- Add per-IP rate limiting on `/api/auth/login` and `/api/auth/register`, most pragmatically at
  the nginx layer already fronting the API in production (`frontend/nginx.conf`).
- Consider a per-account backoff on repeated failed logins, paired with per-IP throttling to
  avoid enabling a lockout-based DoS against a known victim email.

**Fix applied**: same `RateLimiter` as #1, keyed by client IP only (deliberately not by email —
see the module doc in `rate_limit.rs` for why an attacker-controlled, unbounded-length email
string was rejected as a rate-limit key: unbounded memory growth). `register`: 5 attempts/60s;
`login`: 10 attempts/60s. Both return the same generic `429 too_many_requests` message
regardless of which limiter tripped, so no enumeration oracle is introduced. Covered by
end-to-end integration tests (`register_rate_limite_apres_n_tentatives`,
`login_rate_limite_apres_n_tentatives`). Not done (future work): per-account backoff — judged
not worth the added memory-DoS surface for this app's scale; per-IP alone is the fix that
shipped.

---

---

## 2026-09-02 — Dynamic review of `https://pinkphone.home.example.com` (Mode B)

Reviewer: Claude (white-hat dynamic review, Mode B). Authorization: user-attested self-hosted
instance, target confirmed in `SECURITY_SCOPE.local.md` (gitignored, not in this history).
Scope: passive recon + minimal-impact black-box probes only — no account created, no real
invite/space touched, no credential of a real account attempted. Tooling: `curl`/`openssl`
from the sandbox, conservative request volumes throughout.

### 3. `CORS_ORIGIN` left at the dev default in production

- **Status**: fixed (2026-09-02) — [backend/src/main.rs](backend/src/main.rs) (CORS layer), [deploy/docker-compose.yml](deploy/docker-compose.yml), [deploy/docker-compose.local.yml](deploy/docker-compose.local.yml), [backend/.env.example](backend/.env.example)
- **Location**: [backend/src/config.rs:82](backend/src/config.rs#L82) (default `"http://localhost:5173"`); this instance's `.env`/compose config (not in this repo)
- **Class**: CWE-942 (Permissive Cross-domain Policy) / CWE-1188 (Insecure Default Initialization)
- **Severity**: Low (mitigating factor below)
- **Confidence**: confirmed (observed live)

**Finding**: `OPTIONS /api/auth/me` with `Origin: https://evil.example` gets back
`access-control-allow-origin: http://localhost:5173` — a fixed value, not a reflection of the
request's `Origin`. That means `CORS_ORIGIN` was never set for this deployment and fell back to
`config.rs`'s dev default. Since the PWA is served same-origin behind nginx in production, the
CORS layer isn't needed for normal use at all; what's live instead grants cross-origin API
access to whatever runs on `http://localhost:5173` in a visitor's own browser (typically *any*
local Vite dev server, since 5173 is Vite's default port for any project).

**Impact**: low in practice — PinkPhone authenticates via an explicit `Authorization: Bearer`
header taken from `localStorage`, not cookies, so a cross-origin page at `localhost:5173` has no
ambient credential to attach; it cannot read the production origin's `localStorage` either
(browser origin isolation). Exploitation would need a *second*, unrelated bug that leaks the
JWT to that origin. Still real misconfiguration and a signal worth double-checking: other env
vars for this instance may also be at defaults.

**Remediation**: set `CORS_ORIGIN` to the real origin (`https://pinkphone.home.example.com`) in
this instance's environment, or drop the `CorsLayer` entirely for same-origin deployments and
gate it behind `cors_origin` being non-empty.

**Fix applied**: root cause was systemic, not specific to this instance — neither
`deploy/docker-compose.yml` nor `docker-compose.local.yml` ever set `CORS_ORIGIN`, so *every*
self-hosted deployment following `INSTALL.md` silently fell back to the dev default. Changed
`main.rs` to only call `.allow_origin(...)` when `CORS_ORIGIN` is non-empty — left unset,
`CorsLayer` never adds `Access-Control-Allow-Origin`, so no cross-origin request is accepted by
the browser (same-origin requests are unaffected either way, since browsers don't apply CORS to
them). Both deploy compose files now set `CORS_ORIGIN` explicitly to `""`; `.env.example` comment
updated to explain when to leave it empty vs. set it for dev. The existing startup-guard block in
`main.rs` also now warns if an exposed instance is still at the literal dev-default value (same
pattern as the `DB_PASSWORD`/`MEDIA_KEY` warnings), as a safety net for anyone bypassing the
compose files. **User action still needed on this specific instance**: set `CORS_ORIGIN=""` (or
redeploy from the updated compose file) to actually pick up the fix — the code change alone
doesn't retroactively change an already-running container's env.

---

### 4. Missing `Strict-Transport-Security` header

- **Status**: fixed (2026-09-02) — [frontend/nginx.conf](frontend/nginx.conf)
- **Location**: `frontend/nginx.conf` (document headers block) and/or the a reverse proxy layer in front of it
- **Class**: CWE-319 / CWE-523 (Unprotected Transport of Credentials) — missing HSTS
- **Severity**: Low–Medium
- **Confidence**: confirmed (observed live)

**Finding**: TLS is valid (Let's Encrypt wildcard `*.home.example.com`) and `http://` correctly
301-redirects to `https://`, but no response carries a `Strict-Transport-Security` header. Every
visit is therefore a fresh opportunity for an on-path attacker (hostile Wi-Fi, compromised
router) to intercept the initial plaintext `http://` request before the redirect fires and strip
TLS for that session (classic SSL-stripping) — HSTS is exactly what closes this window by
telling the browser to never attempt `http://` again for this host.

**Remediation**: add `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;`
at whichever layer terminates TLS first (a reverse proxy, or `frontend/nginx.conf` if a reverse proxy just
forwards). Start without `preload` until confirmed stable across all subdomains.

**Fix applied**: added the header to `frontend/nginx.conf`'s `location /` block, alongside the
other SEC-007 hardening headers (no `preload`, per the remediation note above — can be added
later once confirmed stable). Ships in the `web` image on the next build; picks up automatically
on this instance's next `docker compose pull && up -d`.

---

### 5. Duplicate, contradictory `X-Frame-Options` header (documentation bug, not currently exploitable)

- **Status**: fixed (2026-09-02) — [frontend/nginx.conf](frontend/nginx.conf) (comment corrected)
- **Location**: [frontend/nginx.conf](frontend/nginx.conf) (`X-Frame-Options "DENY"`, comment "SEC-NEW-005") vs. the a reverse proxy layer (observed sending `SAMEORIGIN`)
- **Class**: CWE-1021 (Improper Restriction of Rendered UI Layers) — informational; CSP already mitigates
- **Severity**: Informational
- **Confidence**: confirmed (observed live)

**Finding**: the document response (`GET /`) carries **two** `X-Frame-Options` headers with
different values — `DENY` (from `frontend/nginx.conf`) and `SAMEORIGIN` (from a reverse proxy).
`nginx.conf`'s own comment says re-adding these headers is "inoffensif (mêmes valeurs)" — that
assumption is factually wrong for this specific header. Browser handling of duplicate
`X-Frame-Options` with conflicting values is undefined/inconsistent across engines. **Not
currently exploitable**: the same response also carries `Content-Security-Policy: ...
frame-ancestors 'none'`, which every modern browser prefers over `X-Frame-Options` when both are
present, so clickjacking protection is intact regardless of the duplicate.

**Remediation**: update the `nginx.conf` comment (the assumption doesn't hold for
`X-Frame-Options`), and either align the value with a reverse proxy's or drop the redundant
nginx-level header for this specific field since CSP already covers it.

**Fix applied**: kept `nginx.conf`'s own `X-Frame-Options: DENY` (still needed for a standalone
deployment with no reverse proxy in front, per the original SEC-NEW-005 rationale) and rewrote
the comment to state accurately that a third-party proxy's own headers *add to* rather than
*replace* these, that duplicate/conflicting values are possible, and that it's harmless here only
because CSP's `frame-ancestors 'none'` supersedes both. No functional change — this was a
documentation bug, not a behavior bug.

---

### 6. Live verification of finding #1/#2's fix — confirmed deployed and working (post-redeploy)

- **Status**: verified fixed (2026-09-02), live on `pinkphone.home.example.com`
- **Location**: a reverse proxy (login/register — masks the app-level limiter) + [backend/src/routes/spaces.rs](backend/src/routes/spaces.rs) (`join_by_invite` — app-level limiter directly observed)
- **Confidence**: confirmed (observed live, before and after redeploy)

**Before redeploy**: repeated failed `POST /api/auth/login` got a `429` whose body was nginx's
stock error page (`<title>429 Too Many Requests</title>`), not the app's JSON — proof that
a reverse proxy throttles this path ahead of the application, independent of whether the app-level fix
was even deployed.

**After merging `develop` → `prod` (commit `7b1fec8`), pushing, and the user rebuilding/
redeploying via the pipeline**: re-ran the login probe — still masked by a reverse proxy's edge
throttle (429 at attempt ~7, same stock HTML body), which fires before the app ever sees enough
requests to hit its own 10/60s ceiling on this path. **However**, testing `POST /api/spaces/join`
directly (two real pentest accounts created — `pentest-alice@example.invalid` /
`pentest-bob@example.invalid`, a real test space + real invite code from alice) got the app's
**own** JSON 429 (`{"code":"too_many_requests","error":"trop de tentatives, réessaie dans une
minute"}`) at attempt **9 of 9** with bogus codes — exactly matching `JOIN_MAX_ATTEMPTS = 8` in
[backend/src/routes/spaces.rs](backend/src/routes/spaces.rs). This conclusively confirms the
app-level fix for finding #1 is live and enforcing correctly in production; a reverse proxy does not
appear to throttle this specific path the same way it does login, so the app-level limiter is
doing the real work here. The legitimate join (real code) right after was itself correctly
blocked too, since it shares the same rate-limit budget — expected, and clears after the 60s
window.

**IDOR / multi-tenant isolation, also verified live**: before bob joined alice's test space, `GET
.../posts`, `GET .../members`, and `POST .../posts` all correctly returned `403 forbidden` for
bob's token. Matches the static-review conclusion that `ensure_member` is applied consistently.

**Direct-access retest (bypassing a reverse proxy)**: the user exposed the API container directly
(`http://atlas-docker.home:8095`, recorded in `SECURITY_SCOPE.local.md`), letting the app-level
limiter be tested in isolation instead of always losing the race to a reverse proxy's own edge
throttle. Results, both with the app's own JSON 429 body:
- `POST /api/auth/login`: `401` × 10, `429` on attempt **11** — exact match for `LOGIN_MAX_ATTEMPTS = 10`.
- `POST /api/auth/register` (deliberately-too-short password, 400 each time, no account created): `400` × 5, `429` on attempt **6** — exact match for `REGISTER_MAX_ATTEMPTS = 5`.

All three limiters (`login`=10, `register`=5, `join`=8, all per 60s) are now individually
confirmed live and enforcing at their exact coded thresholds. Note: a reverse proxy still fires first
on the public path for login/register (its own throttle is stricter/faster there), so the app
limiter is a true defense-in-depth backstop on that path rather than the first line of defense —
worth knowing, not worth changing.

**Aside — transient outage during testing, explained**: mid-retest, the direct endpoint returned
a couple of `502`s then briefly refused connections before recovering on its own. This coincided
with a `git push` to `prod` from this session, which triggers `.forgejo/workflows/release.yml`
and (per the user) redeploys automatically — the API container was restarting, not crashing
under the test load. Confirmed recovered (both direct and public paths healthy) before
continuing; no indication the rate limiter itself caused any instability.

**Cleanup note**: the app has no account/space deletion endpoint. Only two real accounts exist
from this whole engagement — `pentest-alice@example.invalid` and `pentest-bob@example.invalid`
(the login/register threshold probes used wrong passwords / too-short passwords on purpose, so
none of those attempts created accounts) — plus one test space
(`902c73cf-0798-4cd9-ba2c-b58bb989f64e`, "Pentest Space (à supprimer)") and one test post inside
it. These need manual removal via `psql` if desired (filter on `pentest-*@example.invalid` /
content tagged "pentest"/"à supprimer").

---

### 7. SVG accepted as valid image media — stored active content

- **Status**: fixed (2026-09-02) — [backend/src/routes/media.rs](backend/src/routes/media.rs) (`mime_allowed` → explicit allowlist)
- **Location**: [backend/src/routes/media.rs](backend/src/routes/media.rs) (`mime_allowed`, was: `mime.split('/').next() == "image" | "video"`)
- **Class**: CWE-434 (Unrestricted Upload of File with Dangerous Type); CWE-79-adjacent (SVG active content)
- **Severity**: Medium (see exploitability caveats below — this is a genuine gap, not a proven universal 1-click XSS)
- **Confidence**: confirmed at the server level (live PoC); client-side script-execution impact is browser-dependent and not independently confirmed

**Finding**: `mime_allowed` only checked the MIME type's prefix (`image/` or `video/`), so
`image/svg+xml` passed. SVG is an XML document format that can embed a `<script>` element. Live
PoC against `pinkphone.home.example.com` (pentest-alice's test space): uploaded a 167-byte SVG
containing `<script>console.log(...)</script>` via `POST /api/spaces/{id}/media` with
`Content-Type: image/svg+xml` — accepted (`201`, mime stored as-is), then re-fetched via
`GET /api/spaces/{id}/media/{mid}` — served back with `Content-Type: image/svg+xml` unchanged,
`X-Content-Type-Options: nosniff` present (irrelevant here — `nosniff` guards against the browser
*guessing* a different type than declared; the declared type itself is the dangerous one) and
**no** `Content-Security-Policy` on this response (the app's CSP is only set by
`frontend/nginx.conf` on the SPA document route, not on API responses).

**Why this isn't a slam-dunk universal XSS (and why it's still worth fixing)**: within the app's
own UI, `SafeMedia` renders images via `<img src={blobUrl}>` — browsers never execute scripts
embedded in an SVG loaded as an `<img>`, regardless of CSP. The download button
([frontend/src/components/SafeMedia/SafeMedia.tsx:168](frontend/src/components/SafeMedia/SafeMedia.tsx#L168))
uses `<a href={blobUrl} download>`, which forces a save rather than a render — also safe. The
realistic trigger is a user (or an attacker who tricks a partner) opening the media's `blob:`
object URL as a **top-level navigation** — e.g. a browser's native "open image in new tab" escape
hatch that bypasses the page's own `onContextMenu` preventDefault (Firefox's Shift+right-click is
one documented example). Per the Fetch/CSP spec, a `blob:` URL is supposed to inherit the
creating document's CSP — and the SPA's CSP (`script-src 'self'`, no `unsafe-inline`) would then
block the inline `<script>` in current Chrome/Firefox. **Not independently verified here**
(attempted a local, isolated repro to confirm blob-CSP inheritance empirically; environment
tooling issues prevented completing it in this session — treat the CSP mitigation as *likely but
unconfirmed*, not relied upon). WebKit/Safari has historically had a weaker track record on
blob-CSP inheritance than Chromium/Firefox, which matters here since this app is explicitly
distributed as an iOS PWA. Independent of script execution entirely, SVG's XML parser also
carries a CSP-independent DoS surface (entity expansion / "billion laughs") that a raster-image
allowlist closes as a side effect.

**Impact if exploitable**: a script running in the app's origin can read `localStorage` (`pp_token`,
the JWT) and call the API with it — i.e., exactly the "retrieve media you shouldn't have access
to" scenario asked about: exfiltrate every post/media/mood/challenge in every space the victim
belongs to, not just the one media item.

**Remediation**: don't rely on inherited-CSP browser behavior for a media pipeline that's
supposed to hold intimate content — validate the upload itself. Replace the prefix check with an
explicit allowlist of safe raster/video MIME types (no SVG, no other XML/script-capable format).

**Fix applied**: `mime_allowed` now checks against `ALLOWED_MIMES`, an explicit list (JPEG, PNG,
WebP, GIF, HEIC/HEIF, AVIF; MP4, WebM, QuickTime, M4V, 3GPP, Ogg) — `image/svg+xml` (and anything
else not on the list) is rejected at upload. Covered by a new unit test
(`mime_svg_toujours_refuse`). The PoC SVG itself was uploaded standalone (never attached to a
post) so it's already covered by the existing hourly orphan-media purge — no manual cleanup
needed for it specifically.

---

## 2026-09-02 — Extended static review (backend, continued)

Reviewer: Claude (white-hat static review, Mode A), continuing the same engagement per user
request to keep looking for more issues, focused this round on: dependency CVEs, and a closer
pass on auth/logging code not yet deep-dived.

### 8. Log injection via unescaped client-supplied log message (`/api/logs`)

- **Status**: fixed (2026-09-02) — [backend/src/routes/logs.rs](backend/src/routes/logs.rs)
- **Location**: [backend/src/routes/logs.rs](backend/src/routes/logs.rs) (`ingest`)
- **Class**: CWE-117 (Improper Output Neutralization for Logs); secondary CWE-400 (Uncontrolled Resource Consumption, `level` field)
- **Severity**: Low
- **Confidence**: confirmed by code reading (Rust `tracing`/`fmt` semantics are well-defined; no dynamic PoC — can't observe this instance's raw `docker logs` remotely)

**Finding**: `entry.message` was interpolated directly into the log line via `Display`
(`"log client : {message}"`), while `context` and `user_agent` were already safely
Debug-formatted (`?context`, `?ua`, which escapes control characters). `message` was the one
field a client could use to inject raw newlines (forging fake-looking log lines) or ANSI/terminal
escape sequences into `docker logs` — the app's own docs say this is exactly where an operator
reads these logs directly (`"visible via docker logs"`). Separately, `level` had **no length
bound at all** (unlike message/context/user_agent, all truncated) while the route sits under the
same global 100 MB body limit as media uploads — a client could send up to 50 entries per request
each carrying a huge `level` string, flooding the log stream / disk.

**Remediation**: escape control characters in `message` before logging (or move it to a
Debug-formatted structured field, like the others); bound `level`'s length the same way as the
other fields.

**Fix applied**: added `escape_for_log()` (`str::escape_debug()`) applied to both `message` and
`level`; `level` is now also truncated to 32 bytes. Covered by a new unit test
(`escape_for_log_neutralise_les_caracteres_de_controle`).

---

### 9. OIDC account takeover via unverified email claim

- **Status**: fixed (2026-09-02) — [backend/src/routes/oidc.rs](backend/src/routes/oidc.rs)
- **Location**: [backend/src/routes/oidc.rs](backend/src/routes/oidc.rs) (`callback_inner` / `upsert_oidc_user`)
- **Class**: CWE-345 (Insufficient Verification of Data Authenticity); CWE-287-adjacent (Improper Authentication)
- **Severity**: Medium (precondition-gated — see below)
- **Confidence**: confirmed by code reading + integration test; not exploitable against this specific instance without a second, less-trusted OIDC issuer (see precondition)

**Finding**: `upsert_oidc_user` links a login to an **existing** password-based account by email
match (`UPDATE users SET oidc_sub = $1 WHERE email = $2`) whenever no `oidc_sub` match is found
first. The `id_token` claims struct (`IdClaims`) never deserialized `email_verified` — meaning the
`email` claim was trusted for account linking regardless of whether the OIDC provider actually
verified it. Any OIDC provider (or provider configuration) that issues a token with an `email`
claim the holder doesn't actually control — self-service email fields, some SAML-to-OIDC bridges,
misconfigured providers — would let that identity silently take over whichever existing PinkPhone
account already has that email address, on password-auth accounts that never opted into OIDC.

**Precondition**: this depends on `OIDC_ISSUER` pointing at a provider that doesn't verify email
ownership. A well-configured private IdP the same admin controls (e.g. Authentik/Keycloak used
exactly to gate the couple's own accounts) typically does verify email and sets
`email_verified: true`, in which case this was never reachable on *this* instance. Flagged and
fixed anyway because relying on "our IdP happens to be careful" isn't a substitute for checking
the claim the spec provides for exactly this purpose, and because `OIDC_ISSUER` is admin-supplied
config that could point anywhere.

**Remediation**: check `email_verified` before trusting `email` for existing-account linking.

**Fix applied**: extracted the decision into a small pure function,
`trusted_email(sub, claimed_email, email_verified)` — returns the provider's email only when
`email_verified == Some(true)`, otherwise the pre-existing synthetic fallback
(`{sub}@oidc.local`, already used when no email is provided at all). Applied **before** either
the linking-by-email step or new-account creation — not just the linking step — because an
initial fix that only gated linking still hit a **unique-constraint violation** on account
creation when the unverified email collided with an existing account's real email; caught by
writing the test first (`oidc_email_non_verifie_ne_hijacke_pas_un_compte_existant`, initially
failed with exactly that DB error) before landing the corrected version. Covered by 3 unit tests
on `trusted_email` (verified/unverified/absent) in `backend/src/routes/oidc.rs`.

---

### 10. Dependency hygiene — `cargo audit` findings

- **Status**: partially fixed (2026-09-02) — [backend/Cargo.lock](backend/Cargo.lock)
- **Class**: CWE-1104-adjacent (Use of Unmaintained Third-Party Components)
- **Severity**: Informational (see per-item reachability analysis)
- **Confidence**: confirmed (tool output); reachability verified via `cargo tree -i`

Ran `cargo audit` for the first time on this project (installed `cargo-audit`, not previously in
the toolchain). Findings, each checked for actual reachability rather than reported at face
value:

- **`h2` 0.4.14, RUSTSEC-2026-0258** (unbounded empty DATA frames, DoS) — real dependency of
  `axum`'s and `reqwest`'s HTTP/2 stack (server *and* outbound client to OIDC/push endpoints).
  **Fixed**: `cargo update -p h2` → 0.4.19 (patched version available, drop-in).
- **`anyhow` 1.0.102, RUSTSEC-2026-0190** and **`event-listener` 5.4.1, RUSTSEC-2026-0221**
  (soundness issues, not directly web-reachable in this app's usage) — **fixed** via
  `cargo update` regardless, cost-free.
- **`rsa` 0.7.2/0.9.10, RUSTSEC-2023-0071** (Marvin Attack timing side-channel in private-key
  operations) — **not fixed, no patched version exists upstream**. Traced via `cargo tree -i` to
  `web-push` → `jwt-simple`, which supports RSA algorithms `jwt-simple` itself never uses here:
  VAPID (this app's only use of `jwt-simple`/`web-push`) signs exclusively with ES256/P-256 per
  RFC 8292, and separately, `jsonwebtoken`'s own RS256 path (used for OIDC `id_token` verification)
  depends on `ring`, not `rsa`, and only ever *verifies* with a *public* key — the Marvin Attack's
  actual risk (recovering a *private* key via timing) doesn't apply to either use in this
  codebase. Dead dependency weight, not a live vulnerability here — left as-is; would need an
  upstream fix or dropping `jwt-simple`/`web-push`'s RSA feature (not currently possible via
  Cargo features) to fully silence the advisory.
- **`spin` 0.9.8, yanked** — not a vulnerability, informational only, deep transitive dependency.

`npm audit --omit=dev` on `frontend/`: **0 vulnerabilities**.

---

### 11. SSRF via unvalidated Web Push subscription endpoint

- **Status**: fixed (2026-09-02) — [backend/src/notifications.rs](backend/src/notifications.rs), [backend/src/routes/notifications.rs](backend/src/routes/notifications.rs)
- **Location**: [backend/src/routes/notifications.rs](backend/src/routes/notifications.rs) (`subscribe`, `POST /api/me/push`); consumed later by `notify_members` in [backend/src/notifications.rs](backend/src/notifications.rs)
- **Class**: CWE-918 (Server-Side Request Forgery)
- **Severity**: High — self-contained (no victim interaction needed) and confirmed live
- **Confidence**: confirmed (live PoC against `pinkphone.home.example.com`)

**Finding**: `POST /api/me/push` stored `endpoint` (the Web Push subscription URL) with **zero**
validation — no scheme check, no host allowlist, no check against internal/private address
ranges. That `endpoint` is later used, verbatim, as the target of an outbound HTTPS request made
by the server itself (`notify_members`, fired on every new post/comment/challenge/mood-nudge/love
note/desire-match/evening-menu-match). Any authenticated user could register an `endpoint`
pointing anywhere — an internal service on the docker/home network, a cloud metadata endpoint
(`169.254.169.254`) if ever hosted on cloud infra, or a third party to relay/obscure requests —
and get the server to make that request on their behalf, next time any space event fires.
**Fully self-contained**: an attacker doesn't need a partner's cooperation at all — two accounts
of their own in the same space (self-created, no invite needed beyond what they already control)
is enough: subscribe account B to the malicious endpoint, have account A post anything, and the
server fires the request.

**Live PoC**: `POST /api/me/push` with
`{"endpoint":"http://169.254.169.254/latest/meta-data/","keys":{"p256dh":"AAAA","auth":"BBBB"}}`
(pentest-alice's token) → **`204 No Content`**, accepted and stored as-is. Cleaned up immediately
via `DELETE /api/me/push?endpoint=...` (never triggered an actual send — that would have required
also firing a `notify_members` event, judged unnecessary beyond this point: the acceptance itself
already proves the missing validation conclusively, and this specific instance isn't cloud-hosted
so there was nothing meaningful behind that particular metadata IP to reach — but the identical
flaw would matter a lot on a cloud-hosted deployment).

**Remediation**: validate `endpoint` before storing it — require `https://`, resolve the host, and
reject if any resolved address is loopback/private/link-local/reserved. Revalidate at send time
too (not just at subscribe time) to shrink the DNS-rebinding window.

**Fix applied**: `notifications::endpoint_is_safe()` — requires `https://`, then rejects loopback/
private (RFC 1918)/link-local/unspecified/multicast/broadcast/documentation IPv4 ranges, the IPv6
equivalents (loopback, unique-local `fc00::/7`, link-local `fe80::/10`, unspecified, multicast),
and IPv4-mapped IPv6 addresses disguising a private IPv4 (`::ffff:10.0.0.1`). For a hostname, all
DNS-resolved addresses are checked, not just the first. Called both at `subscribe()` (fails fast
with `400`) and again inside `notify_members`'s send loop right before each request (shrinks, but
does not eliminate, a DNS-rebinding window — documented as a known residual limitation rather than
solved, since closing it fully would need per-connection IP pinning inside `web-push`'s own HTTP
client, which isn't exposed for hooking). A subscription that fails re-validation at send time is
purged. Covered by 8 unit tests (pure IP-classification cases + `endpoint_is_safe` scheme/IP-literal
cases); DNS-resolution-dependent hostname cases aren't unit tested (would need network access in
CI) but are exercised by the same code path as the tested IP-literal cases.

---

### 12. Rate limiter itself was unbounded/CPU-heavy under a high-cardinality-key flood

- **Status**: fixed (2026-09-02) — [backend/src/rate_limit.rs](backend/src/rate_limit.rs)
- **Location**: [backend/src/rate_limit.rs](backend/src/rate_limit.rs) (`RateLimiter::is_limited`)
- **Class**: CWE-400 (Uncontrolled Resource Consumption)
- **Severity**: Low–Medium — not remotely triggerable without real traffic volume + IP diversity; caught by this session's own stress test rather than external testing
- **Confidence**: confirmed (reproduced and measured locally, not tested against the live instance — would require actually generating a large distinct-IP flood against someone's home network, judged disproportionate for a PoC)

**Finding**: found while hardening finding #1/#2's rate limiter, by writing a stress test for it
rather than trusting the design by inspection. Two related problems:

1. The stale-entry cleanup (fires once the map exceeds 10,000 keys) only removes keys that have
   gone quiet — a flood of **always-new** keys (trivial with IPv6: an attacker with a single /64
   has 2^64 addresses) never looks "quiet" while the attack is ongoing, so the very fix intended
   to stop brute-force could itself be turned into a memory-exhaustion vector. The hard cap added
   to close this (`HARD_CAP`) is necessary but not sufficient on its own:
2. Naively evicting back down to *exactly* the cap meant the very next insertion hit the cap
   again, re-triggering a full O(n log n) sort **on every single subsequent request across the
   entire API** (the limiter's mutex is shared by login/register/join) for as long as the flood
   continued. Measured directly: the stress test added for this fix (~50,500 distinct keys) took
   **57 seconds** with the naive version — i.e. this component, built to stop a DoS, would have
   become a severe DoS amplifier (CPU + global lock contention) under exactly the load pattern it
   was supposed to defend against.

**Remediation**: amortize the expensive maintenance instead of re-running it near every call once
thresholds are crossed, and evict with headroom rather than down to the exact limit.

**Fix applied**: maintenance (stale-purge + hard-cap eviction) now runs at most once every 256
calls (`MAINTENANCE_INTERVAL`), and eviction overshoots to 90% of the cap
(`HARD_CAP_MARGIN`) rather than stopping exactly at it — creating headroom so thousands of new
keys can arrive before maintenance needs to run again. Same stress test after the fix: **0.24
seconds** (≈240×). Covered by `plafond_dur_tient_sous_un_flot_de_cles_toujours_nouvelles`, with an
assertion tolerance that accounts for the bounded slack the amortization intentionally allows.

---

### 13. No rate limiting on media upload

- **Status**: fixed (2026-09-02) — [backend/src/routes/media.rs](backend/src/routes/media.rs) (`upload`)
- **Location**: [backend/src/routes/media.rs](backend/src/routes/media.rs) (`POST /api/spaces/{id}/media`)
- **Class**: CWE-400 (Uncontrolled Resource Consumption)
- **Severity**: Medium — needs an authenticated space member (not anonymous), but that includes
  anyone who joined via a leaked/guessed invite, and it's disk exhaustion on the host itself
- **Confidence**: confirmed (code reading; no live PoC — didn't want to actually fill disk on the
  user's home server to prove it)

**Finding**: unlike login/register/join, `upload` had no rate limiting at all — only the existing
global `DefaultBodyLimit` (100 MB, sized for legitimate photo/video posts) capped a single
request. A member could script repeated 100 MB uploads with no frequency limit and fill the host's
disk.

**Remediation**: add a rate limit generous enough for legitimate use (a full gallery is
`MAX_MEDIA` = 10 items) but bounding sustained automated abuse.

**Fix applied**: same `RateLimiter`, keyed by IP and by `user_id` (whichever trips first), 30
uploads/60s — comfortably covers composing several posts with full galleries in a burst. Checked
before `ensure_member` (consistent with the other rate-limited routes: reject before any DB
work). Honestly scoped: this bounds *automated/scripted* abuse, not a determined single member's
ability to eventually fill disk over enough real elapsed time — that would need an actual disk
quota, judged disproportionate to add for this app's scale. Covered by a new integration test
(`upload_media_rate_limite_apres_n_tentatives`, real multipart requests against a live Postgres).

---

### 14. Uploaded photos kept their original EXIF metadata (GPS location, device, timestamp)

- **Status**: verified fixed and live (2026-09-02) on `pinkphone.home.example.com` — [backend/src/routes/media.rs](backend/src/routes/media.rs) (`upload`, `strip_metadata`)
- **Location**: [backend/src/routes/media.rs](backend/src/routes/media.rs) (`upload`)
- **Class**: CWE-200 (Exposure of Sensitive Information); privacy, not an access-control bug
- **Severity**: Medium — no unauthorized access involved, but a realistic, high-consequence privacy
  leak once media leaves the app (via the download feature this was found while testing) for an
  app whose entire value proposition is protecting intimate content
- **Confidence**: confirmed (live PoC)

**Finding**: media bytes were stored and served completely unprocessed — no image pipeline of any
kind existed. Live PoC on `pinkphone.home.example.com`: uploaded a JPEG containing a fake
EXIF-shaped marker (`PENTEST-GPS-MARKER-48.8566N-2.3522E`), downloaded it back, and confirmed the
result was **byte-for-byte identical** to the original, marker fully intact. A real phone photo
carries genuine EXIF GPS coordinates (typically wherever the photo was taken — often home) by
default on most devices; anyone who downloads such a photo through the app's own explicit
"downloadable" feature — the very thing being tested here — walks away with a file that still
carries that location data, with nothing in the product's UI suggesting this.

**Remediation**: strip identifying metadata from photos at upload, before storage/encryption,
while preserving visual correctness (in particular EXIF `Orientation`, which browsers apply
automatically — naively wiping all EXIF would make portrait photos render sideways once the tag
is gone).

**Fix applied**: added `little_exif` (pure Rust, read **and** write EXIF support, no `libheif`/
native dependency required for HEIC — important since iPhones default to that format and this
app is explicitly an iOS PWA). `strip_metadata()` reads the `Orientation` tag if present, clears
all EXIF, then writes back *only* that one tag if it was there — GPS, camera make/model, and
timestamp never survive; a portrait photo still displays right-side-up. Runs in `spawn_blocking`
(CPU-bound), before encryption, best-effort (any failure or unsupported format keeps the original
bytes rather than failing the upload). Covered by 5 unit tests, including a realistic fixture
(built with the `image` crate as a **dev-only** dependency — never shipped in the binary) carrying
both a real GPS tag and a rotated orientation, asserting the output loses the GPS, keeps the
orientation, and stays a valid, correctly-sized decodable image.

**Scope, and a fresh issue caught by re-running `cargo audit` after adding the dependency**:
covers JPEG, WebP, and HEIC/HEIF. **PNG is deliberately excluded**: `little_exif`'s PNG code path
(`clear_metadata` → `xmp::remove_exif_from_xmp`) goes through `quick-xml 0.37.5`, itself affected
by two HIGH-severity (7.5) advisories (RUSTSEC-2026-0194/0195, DoS via unbounded allocation /
quadratic parsing on crafted XML) — pinned by `little_exif`'s own `Cargo.toml`
(`quick-xml = "0.37.5"`), so `cargo update` alone can't reach a patched `>=0.41.0`. Rather than
close a privacy leak by opening a DoS hole, PNG was left out of `exif_file_type()` entirely (JPEG/
WebP/HEIF source code was checked and confirmed to never touch `quick-xml`) — PNG uploads behave
exactly as before this fix. Low practical cost: PNG isn't a typical camera-output format and
rarely carries GPS EXIF in the first place. Revisit if `little_exif`/`quick-xml` publish a fix.
`cargo audit` still lists the advisory (the vulnerable crate stays in the dependency graph even
though this codebase's only call site into it is now avoided) — same "confirmed unreachable, not
independently upgradable, tracked rather than hidden" treatment as the `rsa`/Marvin-Attack case in
finding #10. Also newly listed: `paste` (unmaintained, informational only, not a vulnerability)
and the pre-existing `spin` (yanked, informational).

**Live verification, post-redeploy**: built a realistic JPEG fixture carrying both a genuine
`GPSLatitude` tag and a rotated `Orientation` (6 = 90°) using the same `little_exif`/`image`
crates as the fix itself, uploaded it to `pinkphone.home.example.com`, downloaded it back, and
inspected the result directly (not just a byte-diff this time): **`GPSLatitude` absent,
`Orientation` still `[6]`** — exactly the intended behavior, confirmed live rather than only in
unit tests.

---

### 15. No limit on concurrent WebSocket connections

- **Status**: fixed (2026-09-02) — [backend/src/rate_limit.rs](backend/src/rate_limit.rs) (`ConnectionTracker`), [backend/src/routes/ws.rs](backend/src/routes/ws.rs)
- **Location**: [backend/src/routes/ws.rs](backend/src/routes/ws.rs) (`ws_handler`, `GET /api/spaces/{id}/ws`)
- **Class**: CWE-400 (Uncontrolled Resource Consumption)
- **Severity**: Medium — needs a valid account (not anonymous), but self-contained and confirmed at real scale
- **Confidence**: confirmed (live load test against `pinkphone.home.example.com`)

**Finding**: unlike every other mutating/expensive endpoint touched this session, the WebSocket
upgrade route had no rate limiting on connection *attempts* and, more importantly, no cap on how
many connections could be held open *simultaneously* by one identity. Each open connection costs
a tokio task, a `broadcast::Receiver`, and a file descriptor for its entire (potentially
hours-long) lifetime; `AppState::emit`'s fan-out to all subscribers is O(number of connected
sockets), so a flood of connections degrades event delivery for *every* user on the instance, not
just the attacker.

**Live load test**: opened 50, then 200, truly concurrent WebSocket connections from a single
account (Node.js script, native `WebSocket`) against `pinkphone.home.example.com`. **All 200
succeeded** (avg. handshake ~373 ms), no rejections, no server-side closures, and `/health`
stayed fast (~25 ms) and `200` throughout and after — confirms both the absence of any cap *and*
that this specific test stayed well inside "minimal PoC" territory (no degradation observed or
intended; stopped at 200 deliberately rather than pushing toward an actual resource-exhaustion
outcome on the user's own home server, per the engagement's non-destructive-testing rule).

**Remediation**: add both a rate limit on new connection attempts (churn/reconnect-storm abuse)
and a hard cap on concurrent open connections per identity (the actual resource being exhausted).

**Fix applied**: two complementary mechanisms in `rate_limit.rs`. (1) The existing `RateLimiter`,
keyed by IP and `user_id`, 20 attempts/60s — generous enough for normal reconnect-on-focus
behavior (`SpaceApp` resyncs on `visibilitychange`). (2) A new `ConnectionTracker`: a
per-`user_id` open-connection counter with a `try_acquire`/`ConnectionGuard` pattern — the guard
is threaded into `handle_socket` and decrements the count on `Drop`, covering every exit path
(clean close, network error, lag-induced close) without needing to touch each one individually.
Capped at 10 concurrent connections per user (phone + tablet + desktop + a few browser tabs,
comfortably above real usage, well below anything useful for abuse). Both checks run before the
WS upgrade completes, so a rejected attempt never even opens a socket. Covered by 3 new unit
tests on `ConnectionTracker` (cap enforcement, per-user independence, release-on-drop) — a full
integration test would need a real WebSocket client handshake, judged not worth the added test
harness complexity given the behavior was already confirmed live at real scale (200 connections)
against production.

---

### Reviewed and not flagged (dynamic)

Unauthenticated requests to `GET /api/auth/me`, the media stream route (with random UUIDs), and
the WebSocket upgrade route all correctly fail closed (401 or the expected upgrade-precondition
`400`, no data or stack trace leaked). A malformed-JSON body to `/api/auth/login` returns a
plain, non-verbose parse error with no path/query internals. `/api/notifications/vapid` exposes
the VAPID **public** key only, as intended. `Server: nginx/1.31.4` is disclosed on every
response (minor fingerprinting; low-priority `server_tokens off;` hardening, not filed as its
own numbered finding).

**`view_once` concurrency, live-tested**: fired 30 truly concurrent `GET` requests (`xargs -P 30`)
at the same freshly-uploaded `view_once` media on `pinkphone.home.example.com`. Result: **1×
`200`, 29× `404`** — the atomic claim (`UPDATE ... WHERE consumed = false ... RETURNING id` before
ever reading the file) holds under real concurrent load, exactly as the static review concluded.
No race condition.

**OIDC end-to-end, both paths live-tested**: failure path via `curl` — unknown/wrong `state`,
empty/missing `code` at `/api/auth/oidc/exchange`, and an explicit provider `error=access_denied`
— all collapse to the same generic outcome (`#error=oidc` redirect or generic `401`/`422`), no
oracle revealing which check failed. Success path via a real login through the user's own
Authentik instance (user entered their own password; Claude never touches credential fields,
categorically) — completed twice: once fresh, once as a silent SSO re-auth after logout — both
landed correctly on the real dashboard with a clean URL (no lingering `#code=`/`#token=`
fragment), no console errors. Confirms the SEC-006 design (JWT only ever in a POST response body,
never a URL) in practice, not just by reading the code.

**Full IDOR sweep, remaining space-scoped routes**: with a confirmed non-member account (bob, not
yet joined to alice's test space), hit all 8 remaining `GET` routes (`desires`, `evening-menu`,
`challenges`, `moods`, `suggestions`, `seen`, `notices`, `love-notes`) and 8 write routes (set
desire stance, evening-menu pick, create challenge, set mood, mark seen, post a love note, patch
the space, create an invite) not otherwise covered by earlier live testing. **16/16 correctly
returned `403`.** Extends the `posts`/`members` IDOR confirmation from earlier in this engagement
to every remaining route — `ensure_member`/`ensure_enabled` gating has no gaps.

**HTTP request smuggling across the proxy chain (a reverse proxy → nginx → API)**: sent six raw
malformed requests directly over TLS (`openssl s_client`, `Connection: close` on every one to
avoid touching any pooled/shared connection) probing classic ambiguous-framing triggers: `Content-
Length` + `Transfer-Encoding: chunked` together, duplicate `Transfer-Encoding` headers, an
obfuscated value (leading double-space, and mixed case `Chunked`), duplicate conflicting `Content-
Length` values, and a malformed non-hex chunk size. Every case was handled safely — either
rejected outright with `400` before reaching the application, or (the two obfuscated-encoding
cases) treated consistently as an empty body by both nginx and the Rust backend, with no
disagreement between layers. No smuggling primitive found. Deliberately did not attempt an actual
two-request smuggling PoC (which would mean trying to desync a real connection and potentially
intercept another session's response) — the ambiguity-rejection results already answer the
question, and that further step risks the very live-traffic-impacting outcome the engagement's
non-destructive-testing rule exists to prevent.

**Double-blind business logic (desires "want"/"against", evening menu), live-tested**: alice set
`want` on a desire item — bob's view showed no trace of it (`interested: false, matched: false`)
until he also set `want` on the same item, at which point **both** sides correctly flipped to
`matched: true` in the same request/response cycle. The intentionally-NOT-blind `against` (limit)
path was checked separately: bob's `against` was visible to alice as `limit: true` immediately,
with no reciprocal action needed — confirmed as designed, not a leak. Evening-menu match-of-the-
day showed the identical pattern (private until reciprocated, then revealed to both). No
information disclosure in either direction.

**Service worker / PWA (`frontend/src/sw.js`), code-reviewed**: including the custom Web Share
Target feature (`POST /share-target` → OS-shared media cached client-side, retrieved by the app
via `GET /__shared-media[/n]`) — filenames are `encodeURIComponent`-escaped before use as a header
value (no CRLF/header-injection surface), the whole mechanism is same-origin-only with no server
round-trip (Cache Storage API, per-device), and requires a deliberate user share action to
trigger. `notificationclick` opens/focuses `/` with no user-controlled input in the target URL —
no open-redirect surface. Push payload content is always one of a small set of static,
server-chosen strings (never user-controlled) and is rendered via the browser's native
`showNotification` (no HTML/JS execution even hypothetically). Nothing to fix.

---

### Reviewed and not flagged

For traceability: authentication (JWT iss/aud/exp + `min_token_iat` revocation), OIDC (PKCE,
discovery-issuer pinning, JWKS `kid` refresh, nonce check, code-for-ticket exchange so the JWT
never transits a URL), the WebSocket JWT-in-query-string (mitigated at the nginx layer via a
masked log format, `frontend/nginx.conf` `pp_ws_masked`), the media pipeline (AES-256-GCM at
rest, atomic `view_once` claim preventing the read race, MIME allow-list, path built from a
server-generated UUID key never taken from user input), and all `space_id`-scoped routes
(`ensure_member` consistently applied; author-scoped mutations use `WHERE ... AND author_id =
$n` rather than a separate ownership check) were reviewed and found sound. All SQL uses bound
parameters — no injection surface found.
