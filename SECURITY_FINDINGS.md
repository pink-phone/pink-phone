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
