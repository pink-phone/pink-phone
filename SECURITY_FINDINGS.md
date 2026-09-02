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

- **Status**: open
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

---

### 4. Missing `Strict-Transport-Security` header

- **Status**: open
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

---

### 5. Duplicate, contradictory `X-Frame-Options` header (documentation bug, not currently exploitable)

- **Status**: open (doc/config cleanup)
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

### Reviewed and not flagged (dynamic)

Unauthenticated requests to `GET /api/auth/me`, the media stream route (with random UUIDs), and
the WebSocket upgrade route all correctly fail closed (401 or the expected upgrade-precondition
`400`, no data or stack trace leaked). A malformed-JSON body to `/api/auth/login` returns a
plain, non-verbose parse error with no path/query internals. `/api/notifications/vapid` exposes
the VAPID **public** key only, as intended. `Server: nginx/1.31.4` is disclosed on every
response (minor fingerprinting; low-priority `server_tokens off;` hardening, not filed as its
own numbered finding).

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
