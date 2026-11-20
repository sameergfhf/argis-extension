# AEGIS — Complete Interview & Viva Guide

> **Who this is for:** you built (or are presenting) AEGIS and need to explain it confidently to an interviewer or examiner, even if system design, databases, auth, OAuth and security testing are new to you.
>
> **How to use it:** read Sections 1–4 first (the story and architecture). Then learn your own weak spots from Sections 5–11. Practise Section 17 (Q&A) out loud. Memorise Section 20 (facts) and rehearse Section 18 (demo).

---

## Table of Contents

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [Problem, users, scope](#2-problem-users-scope)
3. [Feature → code map](#3-feature--code-map)
4. [System architecture](#4-system-architecture)
5. [Database design](#5-database-design)
6. [Authentication (AuthN)](#6-authentication-authn)
7. [OAuth 2.0 and OIDC](#7-oauth-20-and-oidc)
8. [Authorization (AuthZ) and multi-tenancy](#8-authorization-authz-and-multi-tenancy)
9. [The four security probes (the product's tests)](#9-the-four-security-probes-the-products-tests)
10. [How AEGIS protects itself](#10-how-aegis-protects-itself)
11. [The latency graph, explained](#11-the-latency-graph-explained)
12. [Frontend architecture](#12-frontend-architecture)
13. [API reference](#13-api-reference)
14. [Testing and quality](#14-testing-and-quality)
15. [Deployment and operations](#15-deployment-and-operations)
16. [System-design interview drills](#16-system-design-interview-drills)
17. [Question bank with model answers](#17-question-bank-with-model-answers)
18. [Demo script](#18-demo-script)
19. [Known limitations (say these before they find them)](#19-known-limitations-say-these-before-they-find-them)
20. [Facts and numbers to memorise](#20-facts-and-numbers-to-memorise)
21. [Glossary](#21-glossary)
22. [File map: where to look for what](#22-file-map-where-to-look-for-what)

---

## 1. The 60-second pitch

> "AEGIS (also called API Sentinel) is a full-stack API security assessment platform. A user submits an HTTP API URL. The backend safely validates the URL, makes a bounded, non-destructive request, and runs four evidence-based security checks: HTTPS/TLS, HTTP security headers, information leakage, and domain reputation. It converts the evidence into a 0–100 Security Assessment Score, stores every scan and finding, draws the request lifecycle as an interactive graph, plots a latency profile, and can export a PDF audit report. It also supports teams: Supabase authentication, workspace roles (Owner, Admin, Member), row-level security, an OpenAPI spec analyzer, and per-operation probes. The frontend is React + TypeScript; the backend is FastAPI + async SQLAlchemy; storage is local SQLite with a Supabase Postgres/Storage sync."

**The one-liner:** *"AEGIS is an evidence-based API security scanner and posture dashboard."*

**The analogy:** it is like a health check-up for an API. It does not perform surgery (no exploitation, no penetration testing). It measures observable vital signs (TLS, headers, leakage, reputation), gives a score, explains *why* each point was lost, and tracks the score over time.

**Say this clearly:** AEGIS is **non-destructive** and **observational**. It does not exploit vulnerabilities, brute-force, fuzz, or modify target data (except when a user explicitly confirms a destructive OpenAPI operation). This is both a product decision and an ethical/legal safety feature.

---

## 2. Problem, users, scope

### The problem
Teams ship APIs fast but often forget baseline hardening:
- plain HTTP or broken certificates,
- missing HSTS / CSP / `nosniff`,
- secrets or stack traces leaking in responses,
- APIs hosted on domains with a bad reputation.

Enterprise scanners are expensive and complex. AEGIS gives a fast, explainable first-pass assessment with a score, evidence and remediation guidance.

### Target users
| User | Need |
|---|---|
| Individual developer | Quick check before deployment |
| Security analyst | Triage, evidence, PDF report |
| Team lead / admin | Shared workspace, history, comparison |
| Guest | Try a scan without an account |

### In scope
- Black-box, single-endpoint observation over HTTP(S).
- TLS certificate and HTTPS posture.
- Response headers and response body leakage.
- Threat-intelligence reputation.
- Score, findings, remediation, visualisations, PDF.
- Multi-tenant workspaces and history.
- OpenAPI spec import and single-operation scans.

### Explicitly out of scope (important for viva)
- Authenticated deep crawling of an entire API.
- Exploitation, SQL injection, XSS, business-logic testing.
- Source-code review (SAST).
- Continuous monitoring/scheduling (not implemented).
- Guaranteeing an API is secure. The PDF itself contains a limitations section.

---

## 3. Feature → code map

| Feature | Where it lives |
|---|---|
| Scan submission, 202 + background job | `backend/app/api/routes.py` → `create_scan` |
| Scan pipeline (request → checks → score → save) | `backend/app/services/scan_service.py` → `run_scan` |
| TLS / HTTPS probe | `backend/app/scanners/tls_checker.py` |
| Security headers probe | `backend/app/scanners/headers_checker.py` |
| Leakage probe | `backend/app/scanners/leakage_checker.py` |
| Reputation probe | `backend/app/scanners/reputation_checker.py` |
| Score maths | `backend/app/services/scoring.py` |
| Latency samples + flow graph | `backend/app/services/visualization_service.py` |
| SSRF defence | `backend/app/security/url_validation.py` |
| Secret redaction | `backend/app/security/redaction.py` |
| PDF report | `backend/app/services/report_service.py` |
| History + comparison | `backend/app/services/history_service.py` |
| OpenAPI parsing / spec cache | `backend/app/services/openapi_service.py` |
| Single-operation scan | `backend/app/services/operation_scan_service.py` |
| Supabase sync | `backend/app/services/supabase_sync.py` |
| User extraction from token | `backend/app/api/auth.py` |
| DB models | `backend/app/models/scan.py`, `finding.py` |
| Auth state (React) | `frontend/src/contexts/AuthContext.tsx` |
| Workspaces/roles state | `frontend/src/contexts/WorkspaceContext.tsx` |
| Axios + JWT injection | `frontend/src/services/api.ts` |
| Polling hook | `frontend/src/hooks/useScan.ts` |
| Score dial / charts / flow | `frontend/src/components/ScoreCard.tsx`, `LatencyChart.tsx`, `FindingsChart.tsx`, `FlowDiagram.tsx` |
| Supabase client-side queries | `frontend/src/services/supabaseService.ts`, `workspaceService.ts` |
| RLS + workspace SQL | `backend/migrations/20261026_workspace_rls_chat_tasks.sql` |

---

## 4. System architecture

### 4.1 The big picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                            │
│  React 19 + TypeScript + Vite + Tailwind v4                         │
│  React Router · Contexts · Axios · Recharts · React Flow            │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS  /api/*   (Authorization: Bearer <Supabase JWT>)
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EDGE / STATIC HOST                                                 │
│  Dev: Vite proxy :3000 → :8000                                      │
│  Prod: Nginx serves the SPA and proxies /api to the backend         │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API LAYER — FastAPI (Python 3.12)                                  │
│  routes.py  →  dependencies (get_db, user context)                  │
│  Pydantic validation, HTTP status codes, BackgroundTasks            │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVICE / DOMAIN LAYER                                             │
│  scan_service · operation_scan_service · scoring · visualization    │
│  report_service · history_service · openapi_service · supabase_sync │
├──────────────────────────────┬──────────────────────────────────────┤
│  SCANNERS                    │  SECURITY CONTROLS                   │
│  tls · headers · leakage     │  url_validation (SSRF)               │
│  reputation                  │  redaction (secrets)                 │
└───────────────┬──────────────┴──────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DATA LAYER — SQLAlchemy 2.0 async                                  │
│  Local: SQLite (aiosqlite)  ·  Cloud: Supabase Postgres + Storage   │
│  Auth: Supabase Auth (GoTrue)                                       │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SYSTEMS                                                   │
│  Target APIs · VirusTotal · Google Safe Browsing · Google/GitHub    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Layers and responsibilities

| Layer | Responsibility | Rule of thumb |
|---|---|---|
| Presentation (React) | Render, route, collect input, poll, visualise | No security decisions |
| API (FastAPI routes) | Validate input, choose status code, call a service | Thin controllers |
| Service (business logic) | Orchestrate scans, scoring, reports, history | Testable, no HTTP details |
| Scanner (domain) | Perform one security check, return `TestResult` | Pure and replaceable |
| Security (cross-cutting) | SSRF validation, redaction | Used by all layers |
| Data (SQLAlchemy) | Persist scans/findings | Async sessions, transactions |
| External adapters | Supabase, VirusTotal, target APIs | Isolated and optional |

This is a **modular monolith**, not microservices. One deployable backend, internally split by responsibility. For a project of this size that is the right trade-off: simple deployment, no network hops between modules, easy transactions. Microservices would add operational cost with no benefit at this scale.

### 4.3 The end-to-end scan lifecycle (memorise this)

1. User enters `https://api.example.com` on the Dashboard.
2. `useScan.startScan()` calls `createScan()` in `api.ts`.
3. The Axios interceptor gets the Supabase session and adds `Authorization: Bearer <JWT>` plus `X-User-Id` / `X-User-Email`.
4. `POST /api/scans` reaches FastAPI.
5. Pydantic validates the body (`ScanRequest`).
6. `resolve_and_validate(url)` parses the URL, checks the scheme, rejects embedded credentials, resolves DNS, and blocks private/loopback/link-local/metadata IPs.
7. A `Scan` row is inserted with `status="pending"` and the owning user/workspace.
8. `run_scan` is queued with `BackgroundTasks`. The API returns **202 Accepted** immediately.
9. The frontend polls `GET /api/scans/{id}` every 2 seconds.
10. In the background, `run_scan` sets `status="running"`, sends the HTTP request (no automatic redirects), manually validates every redirect hop, caps the body at 512 KB, and records timing/events.
11. It runs TLS, headers, leakage and reputation checks (in sequence today; the modules are independent).
12. `calculate_score()` produces earned points, assessed points, coverage, check counts and highest severity.
13. Five sequential latency probes are made; a React-Flow graph is built from real scan events; findings are counted by severity.
14. Everything is written into `scans.result_json`; only actionable `fail`/`warning` findings are inserted into `findings`.
15. The scan is marked `completed` with duration and score.
16. A fire-and-forget task syncs the scan, findings and visualisation JSON to Supabase Postgres + Storage.
17. The next poll sees `completed`, then fetches `/findings` and `/visualizations` and renders the score dial, charts and flow diagram.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Dashboard (React)
    participant AX as Axios (JWT)
    participant API as FastAPI
    participant SSRF as url_validation
    participant DB as SQLite
    participant BG as run_scan (background)
    participant SC as 4 scanners
    participant SB as Supabase

    U->>UI: Enter target URL
    UI->>AX: POST /api/scans
    AX->>API: JSON + Bearer JWT
    API->>SSRF: resolve_and_validate(url)
    SSRF-->>API: validated URL + IP
    API->>DB: INSERT scan (pending)
    API->>BG: BackgroundTasks.add_task(run_scan)
    API-->>UI: 202 Accepted {id, status: pending}
    UI->>API: GET /api/scans/{id} every 2 s

    BG->>DB: status = running
    BG->>BG: HTTP request + redirect checks + 512 KB cap
    BG->>SC: TLS, headers, leakage, reputation
    SC-->>BG: TestResult objects
    BG->>BG: score + latency samples + flow graph
    BG->>DB: status = completed, score, result_json, findings
    BG-)SB: async sync scans/findings/visualisations
    API-->>UI: 200 {status: completed}
    UI->>API: GET findings + visualizations
    API-->>UI: JSON
    UI-->>U: Score, charts, flow, PDF
```

### 4.4 Why this architecture?

- **Separation of concerns:** routes don't contain scanning logic; scanners don't know about HTTP or the DB.
- **Testability:** each scanner and the scoring engine can be unit-tested without a server.
- **Replaceability:** add a CORS check by creating a module and wiring it into `run_scan`.
- **Safety isolation:** all target-facing code goes through one SSRF module and one redaction module.
- **Async I/O:** FastAPI + HTTPX means one worker can handle many waiting requests without threads.
- **Graceful degradation:** reputation is optional; if no API key exists, it becomes `inconclusive` rather than failing the scan.

### 4.5 Deployment topology

```
docker-compose
├── backend  (python:3.12-slim, uvicorn :8000)
│   └── volume: sentinel_db → /app   (SQLite persistence)
└── frontend (node build → nginx:alpine :80)
    ├── /        → React SPA (try_files fallback)
    └── /api     → proxy_pass http://backend:8000
```

In development, Vite runs on `:3000` and proxies `/api` to `:8000`.

---

## 5. Database design

### 5.1 Why two databases?

AEGIS deliberately has **dual persistence**:

| Store | Role | Why |
|---|---|---|
| SQLite (`api_sentinel.db`) | Local/primary operational store for scans and findings | Zero-setup, file-based, perfect for development and demos |
| Supabase Postgres | Cloud system of record + team data | Multi-user, RLS, realtime, durable, accessible from the browser |
| Supabase Storage | JSON artefacts (visualisations, flow diagrams, spec uploads) | Large blobs don't belong in relational rows |

The README calls this "real-time local SQLite paired with asynchronous cloud sync". The backend writes SQLite synchronously; the sync to Supabase is best-effort in the background, and the frontend also writes some data directly to Supabase.

**Trade-off to admit:** dual writes create a consistency problem. If Supabase is down, SQLite still has the data but the cloud copy is stale. There is no outbox, retry queue or reconciliation job. A production design would use one source of truth (Postgres) plus a job queue, or a transactional outbox pattern.

### 5.2 Entity-relationship view

```
auth.users (Supabase)
   │ 1
   │ N
workspaces ──1:N── workspace_members
   │ 1                 (role: owner | admin | member, status: invited | active)
   │ N
scans ──1:N── findings            (SQLite has a real FK + ON DELETE CASCADE)
   │
   └── result_json (TEXT)  ── contains test_results, score, visualizations
workspaces ──1:N── workspace_messages
workspaces ──1:N── workspace_tasks
auth.users ──1:N── spec_uploads (frontend table)
```

### 5.3 Local SQLite schema: `scans`

| Column | Type | Purpose |
|---|---|---|
| `id` | VARCHAR(36) PK | UUID generated in Python |
| `url` | VARCHAR(2048) | Validated target URL |
| `hostname` | VARCHAR(253) | Extracted for display/report |
| `status` | VARCHAR(32) | `pending` → `running` → `completed` / `failed` |
| `started_at` | DATETIME | Server default `CURRENT_TIMESTAMP` |
| `completed_at` | DATETIME | Set on completion/failure |
| `duration_ms` | FLOAT | Total wall-clock time |
| `assessment_score` | FLOAT | 0–100, nullable |
| `earned_points`, `assessed_points` | FLOAT | Score numerator/denominator |
| `assessment_coverage` | FLOAT | % of the 100 points that were assessable |
| `passed_checks`, `failed_checks`, `warning_checks`, `inconclusive_checks` | INTEGER | Counts of individual findings |
| `highest_severity` | VARCHAR(32) | critical/high/medium/low/informational |
| `result_json` | TEXT | Full sanitised result document |
| `error_message` | TEXT | Failure reason |
| `user_id`, `user_email` | VARCHAR | Owner (nullable for guests) |
| `workspace_id` | VARCHAR(36) | Team scope (nullable) |

Indexes: `user_id` and `workspace_id` are indexed (declared with `index=True`).

### 5.4 Local SQLite schema: `findings`

| Column | Purpose |
|---|---|
| `id` | UUID PK |
| `scan_id` | FK → `scans.id`, `ON DELETE CASCADE`, indexed |
| `title` | Check name, e.g. "Strict-Transport-Security" |
| `category` | Test domain, e.g. "HTTP Security Headers" |
| `severity` | critical / high / medium / low / informational |
| `confidence` | confirmed / likely / possible / inconclusive |
| `status` | fail / warning / pass / inconclusive |
| `evidence` | Redacted proof |
| `description`, `why_it_matters`, `remediation` | Human explanation and fix |
| `rule_reference` | e.g. OWASP ASVS V9.2.1 |
| `created_at` | Timestamp |

Only **actionable** findings (`fail` and `warning`) are inserted. Passing checks live only inside `result_json`, which keeps the findings table focused.

### 5.5 Supabase (Postgres) tables

From the code and migration, the cloud schema includes:

- `workspaces` — `id`, `name`, `slug`, `description`, `owner_id`, timestamps.
- `workspace_members` — `workspace_id`, `user_id` (nullable until accepted), `email`, `role`, `status`, `invited_by`, `joined_at`.
- `workspace_messages` — team chat, RLS + Realtime.
- `workspace_tasks` — task assignment, RLS + Realtime.
- `scans` — `id`, `user_id`, `workspace_id`, `target_url`, `scan_type`, `status`, `score`, `findings_count`, `metadata` (JSONB), timestamps.
- `scan_findings` — `id`, `scan_id`, `user_id`, `title`, `description`, `severity`, `endpoint`, `evidence`, `remediation`, `metadata` (JSONB).
- `spec_uploads` — imported OpenAPI specs and storage URLs.

### 5.6 Design decisions you should be able to defend

**Why store `result_json` instead of fully normalising every check?**
- The result shape evolves quickly; a JSON document avoids schema migrations for every new probe.
- Reports and visualisations need the whole document at once.
- Trade-off: not easily queryable/aggregatable, can grow large (capped by 512 KB body), and duplicates data that is also in `findings`.
- Better long-term: normalise `test_results` and keep only a small summary JSON, or use Postgres JSONB with GIN indexes.

**Why UUID primary keys?**
- Generated client/server-side without a sequence, safe to expose in URLs, no collision across distributed writers.

**Why `ON DELETE CASCADE` on findings?**
- Findings have no meaning without their scan; deleting a scan should not leave orphans.

**Why async SQLAlchemy?**
- The workload is I/O-bound (network calls, DB waits). Async avoids blocking a thread per request.

**Why SQLite for local?**
- Zero infrastructure, single file, easy demo. It is excellent for development but has a **single-writer** limitation and weak concurrent-write behaviour. `DATABASE_URL` can point to Postgres because SQLAlchemy abstracts the dialect.

**Migrations:**
- Local: `Base.metadata.create_all()` plus manual `PRAGMA table_info` + `ALTER TABLE` for backward compatibility.
- Cloud: a hand-written SQL migration for RLS, messages and tasks.
- **Gap:** no Alembic. Schema changes are not versioned/reversible for the local DB. In production, use Alembic.

**Transactions:**
- Writes use `async with db.begin()`; the session is created per request by `get_db()`.
- **Gap:** the route passes the request-scoped session into `BackgroundTasks`. The session lifecycle belongs to the request, not the background job. Use a fresh `AsyncSessionLocal()` inside the task.

### 5.7 How would you scale the database?

1. Move the operational store to Postgres (already supported by `DATABASE_URL`).
2. Add proper indexes: `(user_id, started_at DESC)`, `(workspace_id, started_at DESC)`, `findings(scan_id)`.
3. Paginate with keyset pagination (`started_at, id`) instead of `OFFSET` for deep pages.
4. Archive old `result_json` to object storage; keep summaries in the DB.
5. Add read replicas for dashboards if read volume grows.
6. Use a queue/worker for writes, and an outbox table for Supabase sync.

---

## 6. Authentication (AuthN)

### 6.1 Definitions first

- **Identification:** "I am alice@example.com."
- **Authentication (AuthN):** "Prove it." (password, OAuth, passkey, MFA)
- **Authorization (AuthZ):** "What are you allowed to do?" (roles, RLS)
- **Session:** a durable proof that you already authenticated (cookie or token).

AEGIS uses **Supabase Auth** (an open-source identity server called GoTrue) and **JWT access tokens**.

### 6.2 Email/password flow

1. User signs up in `AuthPage.tsx` with `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`.
2. Supabase hashes the password (bcrypt) and stores the user in `auth.users`. It may require email confirmation.
3. Sign-in uses `supabase.auth.signInWithPassword({ email, password })`.
4. Supabase returns a **session**: access token (JWT, short-lived, usually 1 hour), refresh token (long-lived), and user object.
5. `supabase-js` stores the session in browser storage and automatically refreshes the access token before expiry.
6. `AuthContext` listens with `supabase.auth.getSession()` and `onAuthStateChange()` and exposes `user`, `session`, `loading`, `signOut`.
7. Every API call goes through the Axios request interceptor, which adds `Authorization: Bearer <access_token>`.

### 6.3 JWT anatomy

A JWT is three Base64URL parts separated by dots:

```
header.payload.signature
```

Example payload claims:

```json
{
  "iss": "https://<project>.supabase.co/auth/v1",
  "sub": "2f1c...uuid...",          // user id
  "aud": "authenticated",
  "role": "authenticated",
  "email": "alice@example.com",
  "iat": 1792071942,
  "exp": 1792075542,
  "session_id": "..."
}
```

- **Header** says which algorithm (`HS256`, `RS256`, `ES256`).
- **Payload** carries claims (who, issued at, expires, audience).
- **Signature** proves the issuer created it.

**Critical rule:** Base64 decoding is **not verification**. Anyone can read or forge the payload. You must verify the signature, `exp`, `iss` and `aud` before trusting any claim.

### 6.4 What the backend does today (and the gap)

`backend/app/api/auth.py`:

1. If `X-User-Id` is present, it trusts it directly.
2. Otherwise it takes the Bearer token, Base64-decodes the payload with `decode_jwt_payload_unverified()`, and reads `sub` and `email`.

It does **not** verify the signature, expiry, issuer or audience. This means a caller can impersonate any user by sending `X-User-Id: <victim-uuid>` or a hand-crafted unsigned JWT. That is the single biggest security weakness in the project. Be honest about it; then explain the fix.

**Correct implementation sketch:**

```python
import jwt
from jwt import PyJWKClient

JWKS_URL = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
jwks = PyJWKClient(JWKS_URL)

def verify_supabase_jwt(token: str) -> dict:
    signing_key = jwks.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256"],   # or HS256 with the project JWT secret
        audience="authenticated",
        issuer=f"{settings.supabase_url}/auth/v1",
        options={"require": ["exp", "sub", "aud", "iss"]},
    )
```

Then make authentication **required** on scan/history/report routes, not optional. Remove the `X-User-*` trust path entirely.

### 6.5 Access token vs refresh token vs ID token

| Token | Purpose | Lifetime | Sent to |
|---|---|---|---|
| Access token | Authorise API calls | Short (≈1 h) | Your backend / Supabase |
| Refresh token | Obtain a new access token | Long (days/weeks, rotating) | Supabase Auth only |
| ID token (OIDC) | Prove identity to the client | Short | Your frontend; not for API auth |

### 6.6 Session storage and XSS

`supabase-js` stores the session in `localStorage` by default. That survives reloads but is readable by JavaScript, so an XSS bug can steal it. Mitigations: strict CSP, output encoding, no `dangerouslySetInnerHTML`, short token lifetimes, refresh-token rotation. A higher-security design uses HttpOnly, Secure, SameSite cookies with CSRF protection.

### 6.7 Common auth attacks to mention

- **Token forgery / `alg: none`:** never trust the header algorithm; pin accepted algorithms.
- **Expired token replay:** always check `exp` (not done today).
- **Audience confusion:** a token for another service must not be accepted; check `aud`.
- **Privilege escalation:** a user edits `role` in `user_metadata`; never authorise from user-editable metadata. Use `app_metadata` or a database role table.
- **XSS token theft:** see above.
- **CSRF:** less relevant for Bearer tokens in a header; very relevant for cookie sessions.
- **Credential stuffing / brute force:** rate-limit login (Supabase provides some protections; app-level quotas are still wise).
- **Enumeration:** don't reveal whether an email exists.

---

## 7. OAuth 2.0 and OIDC

### 7.1 The idea in one analogy

OAuth is a **valet key**. You don't give the valet your house keys; you give a limited key that opens only the car and expires. Your app never sees the user's Google/GitHub password. The provider issues a limited token instead.

- **OAuth 2.0** = delegated **authorization** ("this app may read your profile").
- **OpenID Connect (OIDC)** = an identity layer on top of OAuth ("this is who the user is", delivered as an ID token).

AEGIS uses OAuth for **login**, which is really OIDC-style authentication via Supabase.

### 7.2 Roles

| Role | In AEGIS |
|---|---|
| Resource Owner | The user |
| Client | The AEGIS React app |
| Authorization Server | Supabase Auth (which federates to Google/GitHub) |
| Resource Server | Supabase userinfo / AEGIS API |

### 7.3 Authorization Code + PKCE flow (what happens when you click "Continue with Google")

1. User clicks Google. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback` } })`.
2. The browser is redirected to Supabase's `/authorize` endpoint, which redirects to Google.
3. AEGIS generates a **PKCE code verifier** and sends its hash (`code_challenge`) plus `state`.
4. Google shows the consent screen. The user approves the requested scopes.
5. Google redirects back to Supabase with a short-lived **authorization code**.
6. Supabase exchanges the code (plus the code verifier) for Google tokens over a back channel. The client secret never reaches the browser.
7. Supabase creates/links the user in `auth.users` and issues **its own** access + refresh tokens.
8. The browser lands on `/auth/callback`, where `supabase-js` detects the session (PKCE code exchange / URL fragment), `AuthCallback.tsx` calls `getSession()` and navigates to `/dashboard`.

For Google, the code also passes `access_type=offline` and `prompt=consent` to request a refresh token and force the consent screen.

### 7.4 Why PKCE and `state` matter

- **PKCE** (Proof Key for Code Exchange) stops authorization-code interception. Even if an attacker steals the code, they lack the verifier.
- **`state`** is a random value checked on return; it prevents CSRF/login-CSRF (an attacker tricking you into completing a flow with their account).
- **`redirect_uri` allowlisting** prevents an attacker from sending the code to their own domain.
- **Scopes** limit access (e.g. `openid email profile`). Request the minimum.
- **Back-channel token exchange** keeps the client secret and provider tokens off the browser.

### 7.5 What Supabase hides from you

Supabase handles provider registration, redirect URIs, PKCE, token exchange, user linking, refresh and JWKS. AEGIS only calls `signInWithOAuth` and reads the resulting session. In a viva, say: *"We delegate the OAuth protocol to Supabase Auth; the app never handles provider secrets or raw provider tokens."*

### 7.6 OAuth vs JWT — don't mix them up

- OAuth is the **protocol/flow** that gets you a token.
- JWT is a **token format**.
- AEGIS's session token is a JWT issued by Supabase after an OAuth or password login.
- OAuth is not automatically authentication; OIDC adds the identity proof.

### 7.7 Interview traps

- "Is the Supabase anon key a secret?" **No.** It is designed to be public and is protected by RLS. The **service role key** is a secret and must stay server-side.
- "Where is the client secret?" In Supabase/provider configuration, never in the React app.
- "Why not store Google tokens?" AEGIS doesn't need Google API access; it only needs identity. Storing provider tokens increases breach impact.
- "What if the callback is intercepted?" PKCE + state + redirect allowlist + HTTPS.

---

## 8. Authorization (AuthZ) and multi-tenancy

### 8.1 The role model

AEGIS has three workspace roles:

| Action | Owner | Admin | Member |
|---|---|---|---|
| View workspace & members | ✅ | ✅ | ✅ |
| Create scans | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ❌ |
| Change roles | ✅ | ✅ (not owner) | ❌ |
| Remove members | ✅ | ✅ (not owner) | ❌ |
| Delete workspace | ✅ | ❌ | ❌ |
| Read/write chat & tasks | ✅ | ✅ | ✅ |

Roles are stored in `workspace_members.role`; ownership is also `workspaces.owner_id`. The frontend derives `isOwnerOrAdmin` in `WorkspaceContext.tsx`.

**Important:** frontend role checks are **UX only**. Anyone can edit JavaScript or call the API directly. Real enforcement must be server-side (RLS or backend checks).

### 8.2 Supabase Row Level Security (RLS)

RLS attaches a policy to a table. Every query is filtered by the policy using the JWT's `auth.uid()` and `auth.jwt()`.

Example: members can read a workspace if they own it or are an active member.

```sql
USING (
  owner_id = auth.uid()
  OR is_workspace_member(id, auth.uid())
)
```

The migration defines helper functions `is_workspace_member(ws_id, u_id)` and `is_workspace_admin(ws_id, u_id)` as `SECURITY DEFINER` with `row_security = off`. Why? A policy on `workspaces` that queries `workspace_members`, whose own policy queries `workspaces`, causes **infinite recursion**. The helper runs with elevated rights and bypasses RLS internally, breaking the cycle safely.

Other policies:
- Only the owner can delete a workspace.
- Admins/owners can insert members.
- A user can update their own membership (e.g. accept an invite) or an admin can.
- Messages/tasks: only active members can read; inserts must match `auth.uid() = sender_id` / `created_by`.
- Realtime is enabled by adding the tables to the `supabase_realtime` publication.

A trigger `handle_new_workspace()` automatically inserts the creator as an `owner` member.

### 8.3 Backend authorization — the honest picture

The FastAPI backend currently does **not** enforce ownership:

| Endpoint | Auth today | Ownership check |
|---|---|---|
| `POST /api/scans` | Optional | Any user/guest; accepts any `workspace_id` |
| `GET /api/scans/{id}` | None | ❌ anyone with the UUID can read |
| `GET /api/scans/{id}/findings` | None | ❌ |
| `GET /api/scans/{id}/visualizations` | None | ❌ |
| `GET /api/scans/{id}/report` | None | ❌ |
| `POST /api/scans/{id}/compare` | None | ❌ path param is unused; body IDs are trusted |
| `GET /api/scans/history` | Optional | Filters by `user_id` only; ignores `workspace_id` and `scope` distinction |
| `POST /api/specifications/analyze` | None | ❌ |

This is a classic **IDOR** (Insecure Direct Object Reference): knowing an object's ID is enough to access it. It is partly mitigated in the cloud path because Supabase RLS filters client-side queries, but the backend SQLite path has no RLS.

Also: `workspace_id` is accepted from the request body without verifying membership. A malicious user could attach scans to another team's workspace (data-integrity/tenant-isolation risk).

`history_service.list_scans` computes `my_total` and `workspace_total` with the same filter (`user_id == user_id`), so the "workspace" scope is not truly team-wide. The team feature depends on Supabase queries in the frontend, not the backend.

### 8.4 The correct design

1. Require authentication on every scan route (`Depends(get_current_user)` that verifies the JWT).
2. Load the scan, then check `scan.user_id == user.id` **or** `is_workspace_member(scan.workspace_id, user.id)`.
3. Reject with **404**, not 403, for objects the user cannot see (avoids existence leaks).
4. Validate that the requested `workspace_id` is one the user belongs to before insert.
5. Apply workspace scoping in SQL, not in the frontend.
6. Enforce the same rules in Supabase RLS for scans/findings (policies are not versioned in this repo — a gap).
7. Add automated tests for cross-user access (user A must not read user B's scan).

### 8.5 Defense in depth

```
UI guards (UX)
   → API authentication (who are you?)
   → API authorization (may you touch this object?)
   → Database RLS (last line of defence)
   → Audit logging (who did what?)
```

Never rely on only one layer. AEGIS currently has layers 1 and 4 (partially) and cloud RLS for workspace tables, but is missing robust layers 2–3 on the backend.

---

## 9. The four security probes (the product's tests)

Every probe returns a `TestResult`:

```python
{
  "name": "HTTP Security Headers",
  "status": "pass" | "fail" | "warning" | "inconclusive",
  "earned_points": 14.0,
  "max_points": 20.0,
  "findings": [ ... individual checks ... ],
  "evidence": { ... observed values ... },
  "recommendations": [ ... ]
}
```

Statuses:
- **pass** — control present/correct.
- **fail** — required control absent or broken.
- **warning** — improvement recommended, not a definitive gap.
- **inconclusive** — could not assess (e.g. no API key); excluded from the score denominator.
- **not_applicable** — no security relevance in this context (e.g. CSP on JSON); neutral.

Severity: critical / high / medium / low / informational.
Confidence: confirmed / likely / possible / inconclusive.

### 9.1 HTTPS and TLS Security — 30 points

| Sub-check | Points | What it does |
|---|---|---|
| HTTPS scheme | 8 | URL must use `https://` |
| Certificate trusted | 10 | Standard CA verification via Python `ssl` |
| Hostname match | 6 | Certificate covers the hostname |
| Not expired | 6 | Checks `notAfter`; warns under 30 days |

Details:
- Uses `ssl.create_default_context()` and `wrap_socket`, so verification is **not disabled**.
- Extracts cipher name and TLS version into evidence.
- Plain HTTP short-circuits with 8/30 and marks TLS sub-checks not applicable.
- Expired certificate = critical; <30 days = warning/medium.
- Limitation: one handshake only; no check of protocol versions, cipher suites, revocation (OCSP/CRL), or certificate chain depth.

### 9.2 HTTP Security Headers — 20 points

| Header | Points | Rule |
|---|---|---|
| `Strict-Transport-Security` | 6 | Required; `max-age=0` fails; `<1 day` warning with 3 points |
| `X-Content-Type-Options` | 4 | Must be `nosniff` |
| `Content-Security-Policy` | 4 | Required for HTML; bonus for non-HTML if present |
| `Cache-Control` | 4 | Context-aware (see below) |
| `X-Frame-Options` | 2 | Required for HTML; bonus for non-HTML if present |

**Context awareness** is the clever part:
- If `Content-Type` is HTML, CSP and X-Frame-Options are required.
- If JSON/binary, they are **not applicable** and should not be penalised (a JSON API cannot be framed/rendered).
- Cache-Control logic:
  - Auth signals present (`Set-Cookie`, `WWW-Authenticate`, `X-Auth-*`) + no `no-store/private/no-cache` → **fail**.
  - No auth signals + explicit `public/max-age` → **pass** (public data may be cached).
  - No signals at all → **warning**.

**Known inconsistency to mention:** the checker says N/A points are excluded from the denominator, but `max_points` stays 20 while `earned_points` excludes them. `scoring.py` adds the full 20. So a perfect JSON API (HSTS 6 + XCTO 4 + Cache 4 = 14) scores 14/20 = 70% on headers, not 100%. The fix is to return an `assessed_max_points` per test and use that in the denominator.

### 9.3 Information Leakage — 25 points

Starts at 25 and deducts for observed patterns:

| Rule | Deduction | Severity |
|---|---|---|
| AWS access key (`AKIA...`) | 10 | critical |
| Generic API key/token (`api_key=`, `bearer ...`) | 8 | critical |
| JWT (`eyJ...`) | 7 | high |
| Private key block | 10 | critical |
| Stack trace | 5 | medium |
| Internal file path (`/var/`, `C:\Users\`) | 3 | low |
| Database error (`SQLSTATE`, `ORA-`, ...) | 6 | high |
| `"password": "..."` field | 8 | critical |
| Debug mode indicators | 4 | medium |
| Sensitive JSON keys (`password`, `client_secret`, ...) | 8 each | critical |

Safeguards:
- Only the first 512 KB is analysed.
- A 5-second analysis budget; if exceeded, the result becomes inconclusive.
- Evidence is redacted before storage.
- The evidence note explicitly says absence of findings is not proof of safety.

Limitations: regex-based, single response, no authenticated endpoints, can false-positive on documentation/sample values.

### 9.4 Domain and Redirect Reputation — 25 points

- Queries **VirusTotal** for the hostname (`last_analysis_stats`).
- Optionally queries **Google Safe Browsing v4** for the URL and redirect destinations.
- Re-validates every redirect destination through the SSRF filter before querying.
- Deductions: malicious domain −20, suspicious −10, unknown −5, blocked redirect −10, malicious redirect −15, GSB threat −20.
- **If no provider is configured**, status is `inconclusive` and the test is excluded from the score.

Limitations: API quotas, provider coverage, domain-level (not endpoint-level) reputation, and no caching.

### 9.5 The scoring formula

```
assessment_score   = (earned_points / assessed_points) × 100
assessment_coverage = (assessed_points / sum(max_points)) × 100%
```

Only tests whose overall status is **not** `inconclusive` contribute to `assessed_points`. This is evidence-based: if you could not test reputation, you should not be punished for it, but you also should not claim 100% coverage.

**Worked examples:**

1. TLS 30/30, headers 20/20, leakage 25/25, reputation 25/25 → 100/100 = **100**, coverage **100%**.
2. TLS 8/30, headers 20/20, leakage 25/25, reputation 25/25 → 78/100 = **78**, coverage **100%**.
3. TLS 30, headers 20, leakage 25, reputation inconclusive → 75/75 = **100**, coverage **75%**.
4. All four inconclusive → `assessment_score = null`, coverage **0%**.

**Why this matters:** a score without coverage is misleading. Always show both. That is exactly what the UI's ScoreCard does.

**Grade bands in the UI:** ≥90 A+ "Hardened perimeter", ≥75 B, ≥50 C, <50 F.

---

## 10. How AEGIS protects itself

A security scanner is an attractive attack tool. AEGIS therefore has its own defences.

### 10.1 SSRF defence (the most important one)

**What is SSRF?** Server-Side Request Forgery: an attacker makes *your server* request an internal resource (`http://169.254.169.254/` cloud metadata, `http://localhost:6379`, `http://10.0.0.5/admin`) and returns the response. It can expose cloud credentials or internal services.

AEGIS layers:

1. **Scheme allowlist:** only `http` and `https`; blocks `file:`, `ftp:`, `gopher:`, etc.
2. **Credential rejection:** `http://user:pass@host` is rejected.
3. **DNS resolution before the request:** every resolved IP is checked.
4. **Blocked networks:** loopback (`127/8`, `::1`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, `fe80::/10`), multicast, unspecified, reserved, unique-local IPv6, and cloud metadata (`169.254.169.254`, `168.63.129.16`).
5. **Redirect re-validation:** redirects are not followed automatically (`follow_redirects=False`); every `Location` is resolved and checked before the next hop. Credentials are not forwarded cross-origin.
6. **Bounded execution:** 512 KB response cap, 15 s timeout, max 5 redirects, no keep-alive connection pool for the primary request.
7. **Raw IPs checked immediately:** a literal private IP never reaches DNS.

**The remaining hole — DNS rebinding (TOCTOU):** `resolve_and_validate` resolves the hostname, then HTTPX resolves it *again* when connecting. An attacker-controlled DNS server can return a public IP during validation and a private IP during the real request. The code comment acknowledges this. A robust fix is to **pin the validated IP** for the connection (custom transport/resolver, `verify_ip`, or an egress proxy/firewall that denies private ranges). Also note `resolved_ip` is passed to the latency function but not actually used there — so latency probes are not IP-pinned either.

### 10.2 Secret redaction

- Sensitive response headers (`Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, ...) are replaced with `[REDACTED]`.
- Text patterns catch API keys, AWS keys, JWTs, private keys, passwords and basic-auth URLs.
- Findings evidence is redacted before persistence and PDF generation.

**Gap:** the raw response body is stored in `result_json.response.body` without redaction. If the target leaks a secret, AEGIS stores it locally and uploads it to Supabase. Fix: run `redact_text` on the body before persistence, or store only a truncated, redacted excerpt.

### 10.3 Safe scanning behaviour

- Non-destructive by default (GET/HEAD/OPTIONS).
- OpenAPI operations: `POST/PUT/PATCH/DELETE` require `confirm_destructive=true`.
- Path parameters are restricted to a safe allowlist (`A-Za-z0-9-_.~%`), preventing path traversal/injection into the URL.
- The user-supplied `auth_header` is used only for the outgoing request and is never written to the DB, `result_json` or logs.
- The spec must be imported first; the server validates `(method, path)` against the cached spec so the client cannot invent endpoints.
- Spec parsing uses `yaml.safe_load`, not `yaml.load`, preventing object construction.
- Uploaded specs are capped at 2 MB.

### 10.4 Infra and secrets

- Secrets come from `.env` via Pydantic Settings; `.env` is git-ignored.
- Backend Docker container runs as a non-root user.
- Frontend/backend separation; the service role key stays server-side.
- CORS is restricted to configured origins (not `*` with credentials).
- PDF filenames are sanitised.

### 10.5 Known security gaps (be ready to list them)

| Gap | Impact | Fix |
|---|---|---|
| JWT not verified; `X-User-Id` trusted | Full account impersonation | Verify signature/exp/iss/aud; remove header trust |
| No auth required on scan read/report routes | IDOR / data leak | Require auth + ownership/workspace checks |
| `workspace_id` not membership-validated | Cross-tenant data injection | Validate membership before insert |
| No rate limiting / quotas (config unused) | Abuse, DoS, cost | Redis token bucket per user/IP |
| Raw response body stored | Secret retention | Redact before persistence |
| Public Supabase Storage URLs | Artefact exposure | Private bucket + signed URLs |
| DNS rebinding | SSRF bypass | Pin validated IP / egress firewall |
| Frontend route guard disabled (`TEMP-AUDIT-BYPASS`) | UI exposure (RLS still protects cloud data) | Re-enable `<Navigate to="/auth">` |
| `GET /docs` exposed in prod | Info disclosure | Disable or protect in production |
| Error `detail` includes exception text | Info leak | Generic messages + server logs |
| No Alembic migrations | Schema drift | Add Alembic |
| No SAST/dependency scanning in CI | Supply-chain risk | `pip-audit`, `npm audit`, Dependabot |
| Docker healthcheck uses `curl` not installed in slim image | False unhealthy | Use Python/httpx healthcheck |
| Compose mounts volume at `/app` | Stale code after image updates | Mount only the DB directory |
| `VITE_SUPABASE_*` not passed as build args | Build falls back to hardcoded project | Inject at build time |

### 10.6 Threat model (STRIDE, simplified)

| Threat | Example | Control |
|---|---|---|
| Spoofing | Forged `X-User-Id` | JWT verification (missing) |
| Tampering | Altering `workspace_id` | Membership check (missing) |
| Repudiation | No audit trail | Partial (history, user fields) |
| Information disclosure | IDOR, secret in body | AuthZ + redaction (partial) |
| Denial of service | Scan flood | Rate limits (missing) |
| Elevation of privilege | Member invites themselves as admin | RLS (present for workspace tables) |
| SSRF | Scan internal metadata IP | Validation (partial; rebinding) |

---

## 11. The latency graph, explained

### 11.1 What it measures

After the main scan request, AEGIS makes **5 sequential GET requests** to the same URL and records each round-trip time in milliseconds. It then computes average, minimum, maximum and failed-request count.

Code: `collect_latency_samples()` in `visualization_service.py`.

```python
async with httpx.AsyncClient(follow_redirects=False, limits=max_connections=1) as client:
    for i in range(1, n_samples + 1):
        point = await _single_request(client, url, i)
        samples.append(point)
        if i < n_samples:
            await asyncio.sleep(0.3)
```

- `n_samples` = `SCAN_LATENCY_SAMPLES` (default **5**).
- Timeout = `REQUEST_TIMEOUT_SECONDS` (default **15 s**).
- 300 ms pause between samples.
- Redirects are not followed.
- A timeout or exception becomes a point with `response_time_ms = null` and increments `failed_requests`.
- The chart uses Recharts; the dashed line is the average; failed points are red.

### 11.2 How to read the chart

- **X-axis:** probe number (1–5), not real time.
- **Y-axis:** round-trip milliseconds.
- **Dots:** each probe; red dot = failure/timeout.
- **Dashed reference line:** average.
- **Summary tiles:** Average / Floor (min) / Ceiling (max).
- The graph is **observational**. It does not affect the security score.

### 11.3 Why sequential, not parallel?

Parallel requests would:
- distort each other's timing (contention, TCP slow start),
- create a burst that looks like an attack,
- make min/max meaningless.

Sequential sampling gives a cleaner baseline. The trade-off is that a scan takes longer (at least 4 × 300 ms plus request times).

### 11.4 Honest limitations

- **5 samples is tiny.** It is a smoke test, not a benchmark.
- **No warm-up.** The first request includes DNS/TCP/TLS setup, so it is often slower (cold start).
- **Single vantage point.** Results depend on the scanner's region and network.
- **No percentiles.** Average hides tail latency; production SLOs care about p95/p99.
- **Plain GET.** If the endpoint requires POST/auth, the measurement may be a 401/405 but still measures server+network time.
- **No retries.** A transient packet loss becomes a "failed" sample.
- **No breakdown.** It measures total round trip, not DNS vs TCP vs TLS vs TTFB vs download.
- **Rate limiting** on the target could distort later samples.

### 11.5 How to improve it (great answer for "what next?")

1. Increase samples to 20–30, discard the first (warm-up), report p50/p95/p99.
2. Use a proper load-testing tool (k6, Locust) for throughput; keep this chart for quick diagnostics.
3. Record a phase breakdown using HTTPX tracing or `httpx-timing`.
4. Sample from multiple regions.
5. Use the original method/auth only if explicitly authorised; otherwise clearly label it as an unauthenticated GET.
6. Add jitter and respect `Retry-After`/429.
7. Store histograms over time to show trends, not just one scan.

### 11.6 Latency vs throughput vs availability

- **Latency:** how long one request takes (ms). What this chart shows.
- **Throughput:** how many requests per second the system handles (RPS).
- **Availability:** percentage of time the service is up (e.g. 99.9%).
- **SLO:** a target, e.g. "p95 latency < 300 ms, 99.9% availability".
- **Error budget:** allowed failure within a period.

If asked "does a low score mean slow?", answer: **no**. Score = security posture; latency = performance. They are independent.

---

## 12. Frontend architecture

### 12.1 Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page with interactive terminal |
| `/auth` | Public | Sign in / sign up / Google / GitHub |
| `/auth/callback` | Public | Session exchange + redirect |
| `/scan/:scanId` | Public (guest view) | Scan results |
| `/dashboard` | "Protected" | New scan + recent results |
| `/history` | "Protected" | Scan history + comparison |
| `/team` | "Protected" | Workspaces, members, invites, chat, tasks |
| `/spec` | "Protected" | OpenAPI spec analyzer |
| `/operation-scan` | "Protected" | Single-operation scan wizard |
| `/settings` | "Protected" | Health, config, API keys |

> **Important:** `ProtectedRoute.tsx` currently has the redirect commented out (`TEMP-AUDIT-BYPASS`), so these pages render for guests. The real protection for Supabase data is RLS; the backend has no guard. Say this honestly if asked.

### 12.2 State management

- **AuthContext:** wraps Supabase session, exposes `session`, `user`, `loading`, `signOut`.
- **WorkspaceContext:** loads workspaces and invitations, selects the active workspace (persisted in `localStorage`), loads members, exposes role helpers and CRUD actions via `workspaceService`.
- No Redux/Zustand: Context is enough for two global concerns. Server data is fetched per page/hook.

### 12.3 Data fetching

- Central Axios instance (`baseURL: '/api'`, 30 s timeout).
- Request interceptor injects the JWT and user headers.
- `useScan` owns scan creation, 2 s polling, stop conditions, and fetching findings/visualisations.
- `api.ts` prefers Supabase for history/findings/visualisations and falls back to the backend. This gives offline/cloud resilience but means two code paths — a consistency risk.

### 12.4 Visualisation

- **Recharts**: latency line chart, findings severity chart.
- **React Flow + Dagre**: the request lifecycle graph. The backend emits nodes/edges from real events; the frontend computes layout with Dagre.
- **ScoreCard**: SVG ring, grade, coverage, check counts, duration.
- **RequestInspector**: sanitised headers/body/redirect chain.
- **SecurityHeadersMatrix**: pass/fail table.

### 12.5 Design system and accessibility

- `components/ui/` primitives: Button, Badge, Card, Input, Modal, Tabs, Table, Toast, Tooltip, ThemeToggle.
- Tailwind v4 tokens in `index.css`; dark/light theme via CSS variables.
- Accessibility: skip link, `aria-live`, focus-visible styles, semantic headings, keyboard-friendly modals.
- `prefers-reduced-motion` is respected in the design tokens.

---

## 13. API reference

| Method | Endpoint | Auth | Success | Notes |
|---|---|---|---|---|
| GET | `/api/health` | No | 200 | DB + provider status |
| POST | `/api/scans` | Optional | 202 | Returns pending scan |
| POST | `/api/scans/operation` | Optional | 202 | OpenAPI operation |
| GET | `/api/scans/history` | Optional | 200 | `limit`, `offset`, `scope` |
| GET | `/api/scans/{id}` | No | 200 | Full scan incl. `result_json` |
| GET | `/api/scans/{id}/findings` | No | 200 | Actionable findings |
| GET | `/api/scans/{id}/visualizations` | No | 200 / 409 | 409 if not completed |
| GET | `/api/scans/{id}/report` | No | 200 | `application/pdf` |
| POST | `/api/scans/{id}/compare` | No | 200 | Body has both scan IDs |
| POST | `/api/specifications/analyze` | No | 200 | multipart `url` or `file` |

Example:

```bash
curl -X POST http://localhost:8000/api/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase-jwt>" \
  -d '{"url":"https://api.github.com"}'
# 202 {"id":"...","status":"pending", ...}

curl http://localhost:8000/api/scans/<id>
curl http://localhost:8000/api/scans/<id>/findings
curl -OJ http://localhost:8000/api/scans/<id>/report
```

Status codes used: 200 OK, 202 Accepted, 404 Not Found, 409 Conflict (scan not complete), 422 Unprocessable Entity (validation/SSRF), 500 Internal Server Error.

**Why 202?** Scanning is long-running. Returning 202 says "accepted, not finished", decoupling the HTTP request lifetime from the scan. The alternative is a synchronous request that risks timeouts.

---

## 14. Testing and quality

### 14.1 What exists

Backend (`backend/tests/`):

| File | Tests | Covers |
|---|---|---|
| `test_headers.py` | 29 | Header rules, context awareness, HSTS edge cases, cache logic |
| `test_leakage.py` | 8 | Secret patterns, JSON keys, redaction |
| `test_url_validation.py` | 11 | SSRF: schemes, loopback, private ranges, credentials, metadata |
| `test_scoring.py` | 6 | Formula, inconclusive handling, severity |
| `test_operation_scan.py` | 21 | Path params, destructive gate, auth non-persistence, URL building |
| `test_live_endpoints.py` | 4 | Live health/scan/report/history/spec (needs a running server) |

Verified locally:
- **79 collected** (pytest counts parametrised cases).
- **75 passed** when the 4 live tests are excluded.
- The README's "75 passing tests" refers to this non-live suite.

Frontend (`frontend/src/__tests__/tokens.test.ts`): design-token/probe-configuration tests with Vitest.

### 14.2 How to run

```bash
cd backend
.\.venv\Scripts\activate
pytest -q
pytest -q --ignore=tests/test_live_endpoints.py   # no server needed

cd frontend
npm test
npm run build
npm run lint
```

### 14.3 What is *not* tested (say this before they ask)

- No tests for auth/JWT verification (because it isn't implemented).
- No API route tests with a test database.
- No authorization/IDOR tests.
- No end-to-end browser tests (Playwright/Cypress).
- No load/performance tests.
- No coverage threshold.
- Some tests depend on the network (`httpbin.org`), which makes CI flaky.
- No mutation testing or fuzzing.

### 14.4 A strong answer to "how do you test a security scanner?"

> "We test each rule with known-good and known-bad fixtures, test the scoring maths independently, and test the SSRF boundary with literal IPs, DNS names and credentials. We also have live integration tests for the lifecycle. What I would add is a corpus of recorded HTTP responses (golden files), property-based tests for parsing, API tests with a temporary Postgres, and CI that runs dependency and secret scanning."

---

## 15. Deployment and operations

### 15.1 Local development

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install --legacy-peer-deps
npm run dev
# http://localhost:3000
```

### 15.2 Docker

```bash
docker-compose up --build
# Frontend http://localhost
# Backend  http://localhost:8000
```

- Backend: `python:3.12-slim`, dependencies installed, non-root `sentinel` user, uvicorn on 8000.
- Frontend: multi-stage build (`node:22-alpine` → `nginx:alpine`), static SPA.
- Nginx: `try_files` fallback for client-side routing; `/api` proxied to `backend:8000`.
- Named volume `sentinel_db` persists SQLite.
- Healthcheck hits `/api/health` (but note: `curl` is not installed in the slim image — a real bug to fix).

### 15.3 Configuration

| Variable | Purpose |
|---|---|
| `APP_ENV` | development/production |
| `SECRET_KEY` | app secret (currently unused by auth) |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `DATABASE_URL` | SQLite or Postgres DSN |
| `SCAN_LATENCY_SAMPLES`, `MAX_RESPONSE_BYTES`, `REQUEST_TIMEOUT_SECONDS`, `MAX_REDIRECTS` | Scanner limits |
| `MAX_CONCURRENT_SCANS`, `SCAN_RATE_LIMIT_PER_MINUTE` | Declared but **not implemented** |
| `VIRUSTOTAL_API_KEY`, `GOOGLE_SAFE_BROWSING_API_KEY` | Reputation providers |
| `REPORT_RETENTION_DAYS` | Declared but no cleanup job |
| `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cloud persistence |

### 15.4 Operations gaps

- No structured JSON logs, request IDs or tracing.
- No metrics (Prometheus) or dashboards.
- No alerting or SLOs.
- No scheduled cleanup/retention (despite config).
- No backup/restore procedure for SQLite.
- No CI/CD pipeline file in the repo.
- No database migration tool.
- Background jobs are in-process, so a restart loses running scans.

---

## 16. System-design interview drills

### 16.1 Requirements clarification (say this first)

Functional:
- Submit a URL, run 4 checks, return score/findings, store history, export PDF, team workspaces.
Non-functional:
- Safety (no SSRF, no destructive actions), bounded runtime, explainability, multi-tenancy, availability, auditability.
Scale assumption:
- Start: 10k scans/day; peak 10×; each scan 10–30 s; results up to 512 KB.

### 16.2 Capacity estimate (show your working)

- 10,000 scans/day ≈ 0.12 scans/s average.
- Peak 10× ≈ 1.2 scans/s.
- Each scan ≈ 1 primary request + 5 latency requests + 1 TLS handshake + 0–3 reputation calls.
- If a scan takes ~15 s, concurrency ≈ 1.2 × 15 ≈ **18 concurrent scans** at peak.
- Storage: 10k × ~20 KB average result ≈ 200 MB/day ≈ 6 GB/month. Cap/retention matters.
- In-process `BackgroundTasks` with a single uvicorn worker cannot guarantee 18 concurrent scans; a queue + worker pool is needed.

### 16.3 Bottlenecks and fixes

| Bottleneck | Why | Fix |
|---|---|---|
| In-process background tasks | Tied to web process; lost on restart; no backpressure | Celery/RQ/Arq + Redis + dedicated workers |
| SQLite single writer | Concurrent writes lock | Postgres |
| Blocking DNS/TLS calls | `socket.getaddrinfo` and `ssl` block the event loop | `asyncio.to_thread`, `anyio`, or async resolver |
| 5 sequential latency probes | Adds seconds per scan | Keep for diagnostics; run in parallel with other modules or sample asynchronously |
| No rate limiting | Abuse/DoS | Redis token bucket per user/IP/target |
| Polling every 2 s | Wasted requests at scale | WebSocket/SSE or long polling |
| Spec cache in memory | Lost on restart, not shared across workers | Redis/Postgres |
| Dual writes | Inconsistency | Single source of truth + outbox |
| Large `result_json` in list/detail | Bandwidth/DB | Store summary, fetch detail on demand, archive blobs |
| Reputation API quotas | 3rd-party limits | Cache by domain with TTL, circuit breaker |

### 16.4 Reliability patterns to mention

- **Idempotency key** on scan creation so a retry doesn't create duplicate scans.
- **Retries with exponential backoff + jitter** for transient network/5xx errors.
- **Circuit breaker** for VirusTotal/GSB.
- **Dead-letter queue** for failed sync jobs.
- **Timeouts everywhere** (already present for HTTP).
- **Graceful shutdown:** stop accepting work, finish in-flight scans.
- **Outbox pattern** for Supabase sync.
- **At-least-once vs exactly-once:** aim for idempotent writes (upsert by ID, already used in Supabase).

### 16.5 Observability

- **Logs:** structured JSON with `scan_id`, `user_id`, `stage`, `duration_ms`, `outcome`; never log tokens.
- **Metrics:** scans started/completed/failed, duration histogram, per-check pass rate, queue depth, Supabase sync failures, provider latency/errors.
- **Traces:** OpenTelemetry spans for validation → request → each check → score → persist.
- **SLOs:** e.g. 99% of scans complete in <60 s; 99.9% API availability; sync lag <5 min.
- **Alerts:** queue depth, error rate, p95 latency, provider quota.

### 16.6 Security architecture summary (one breath)

> "Validate input and block SSRF at the network layer, authenticate every request with a verified JWT, authorise every object access by owner or workspace membership, enforce RLS in Postgres as defence in depth, redact secrets before persistence, bound every outbound request, require explicit confirmation for destructive methods, keep secrets in a managed store, and log security events without logging credentials."

---

## 17. Question bank with model answers

### Beginner / project overview

**Q1. What is AEGIS in one sentence?**
An evidence-based API security scanner that checks TLS, headers, leakage and reputation, scores the result 0–100, visualises it, and stores it for teams.

**Q2. Why did you build it?**
To make baseline API security assessment fast and explainable for developers who cannot afford or operate enterprise scanners.

**Q3. What is the tech stack?**
React 19 + TypeScript + Vite + Tailwind on the frontend; FastAPI + async SQLAlchemy + HTTPX on the backend; SQLite locally; Supabase Auth/Postgres/Storage in the cloud; ReportLab for PDFs; Docker + Nginx for deployment.

**Q4. What is the most interesting part?**
The scoring model: it excludes inconclusive checks from the denominator and shows coverage, so a 100 score with 75% coverage is not presented as a perfect assessment.

**Q5. What was the hardest part?**
Making the header checks context-aware so a JSON API isn't penalised for missing CSP/X-Frame-Options, and keeping the scan safe against SSRF.

**Q6. What is the difference between this and a penetration test?**
A pentest tries to exploit; AEGIS observes external configuration and evidence. It explicitly does not test auth, business logic or injection.

### Architecture

**Q7. Explain the architecture.**
Modular monolith: React SPA → FastAPI routes → services → scanners/security → SQLAlchemy → SQLite/Supabase, with external reputation APIs. See Section 4.

**Q8. Why a monolith, not microservices?**
Small team, one deployable, simple transactions, no inter-service latency. The module boundaries allow splitting later if needed.

**Q9. Why FastAPI?**
Async I/O, Pydantic validation, automatic OpenAPI docs, dependency injection, and strong typing.

**Q10. Why 202 Accepted?**
The scan is long-running; 202 decouples the HTTP response from the work. The client polls.

**Q11. Why polling instead of WebSockets?**
Simpler, stateless, works through proxies, and scans finish in seconds. At scale I'd switch to SSE/WebSockets to reduce request volume.

**Q12. What happens if the server restarts mid-scan?**
The scan stays `running` forever because `BackgroundTasks` are in-process and there is no recovery job. A queue with visibility timeouts and a startup reconciliation job would fix it.

**Q13. What is the request lifecycle?**
See the 17 steps in Section 4.3. Be able to say it without notes.

### Database

**Q14. Why SQLite?**
Zero setup for local development/demo, single file, async via aiosqlite. It is not the production choice for concurrent writes.

**Q15. Why Supabase too?**
Auth, Postgres, RLS, Storage and Realtime in one managed service. It gives the team features without building an identity server.

**Q16. Which is the source of truth?**
In practice, both: SQLite is the backend's operational store; Supabase is the cloud/team store. This is a dual-write design and its main weakness is consistency. The ideal is one source of truth + an outbox.

**Q17. Why JSON in `result_json`?**
Flexible evolving evidence and one read for the report/visualisations. Trade-off: harder to query, duplication, size. Postgres JSONB or normalised tables would be better at scale.

**Q18. What is a primary key? A foreign key?**
PK uniquely identifies a row (`scans.id`). FK enforces a reference (`findings.scan_id → scans.id`) and can cascade deletes.

**Q19. What is an index and why `user_id`/`workspace_id`?**
A sorted lookup structure that speeds reads. History queries filter by owner/tenant, so those columns are indexed.

**Q20. What is a transaction?**
An all-or-nothing unit of work. `async with db.begin()` commits on success and rolls back on error.

**Q21. SQL vs NoSQL?**
SQL gives relations, constraints and transactions; NoSQL gives flexible schemas and horizontal scale. AEGIS's core data is relational (users → scans → findings), so SQL fits. `result_json` is the flexible part.

**Q22. How do you handle schema changes?**
Currently `create_all` + manual `ALTER TABLE` locally and SQL migrations in Supabase. That is a weakness; Alembic would version and roll back changes.

**Q23. How would you scale the DB?**
Postgres, proper composite indexes, keyset pagination, archive JSON blobs, read replicas, partitioning by time/tenant.

### Authentication / OAuth

**Q24. Authentication vs authorization?**
AuthN proves identity; AuthZ decides permissions.

**Q25. How does login work?**
Supabase `signInWithPassword` returns a JWT session; `AuthContext` stores it; Axios sends it as a Bearer token.

**Q26. What is a JWT?**
Three Base64URL parts: header, payload, signature. The payload has claims (`sub`, `email`, `exp`, `aud`).

**Q27. How do you verify a JWT?**
Verify signature with the issuer's key (JWKS), check `exp`, `iss`, `aud`, and algorithm. **AEGIS currently only decodes it — that is a known gap.**

**Q28. Where do you store the token?**
`supabase-js` uses browser storage. That is XSS-sensitive; an HttpOnly cookie is safer but needs CSRF protection.

**Q29. What is OAuth?**
A delegated authorisation protocol that lets an app access resources without the user's password. OIDC adds identity.

**Q30. Explain the Google login flow.**
Authorization Code + PKCE: redirect → consent → code → back-channel exchange → Supabase session → `/auth/callback` → dashboard. See Section 7.

**Q31. What is PKCE? What is `state`?**
PKCE binds the code to a verifier so a stolen code is useless. `state` prevents login CSRF.

**Q32. Why use Supabase instead of implementing OAuth?**
It handles provider config, code exchange, token rotation and JWKS, reducing the attack surface and effort.

**Q33. Is the anon key secret?**
No, it is public by design; RLS protects data. The service role key is secret.

**Q34. What is the difference between an access token and an ID token?**
Access token authorises API calls; ID token proves identity to the client. Don't use an ID token as an API bearer token.

### Authorization / multi-tenancy

**Q35. How do roles work?**
Owner/Admin/Member in `workspace_members`; the owner is also `workspaces.owner_id`. Admins invite/manage; only owners delete.

**Q36. What is RLS?**
Row Level Security: the database filters rows per user using policies and `auth.uid()`. It is enforced even if the client is compromised.

**Q37. Why `SECURITY DEFINER` helpers?**
To avoid infinite recursion between `workspaces` and `workspace_members` policies; the helper bypasses RLS internally with controlled logic.

**Q38. Is the frontend role check enough?**
No. It is UX only. Authorization must be server-side/RLS.

**Q39. What is IDOR? Does AEGIS have it?**
Insecure Direct Object Reference: accessing an object by guessing its ID. **Yes, the backend scan read/report routes currently lack ownership checks** — a known gap with a clear fix.

**Q40. How would you fix multi-tenant isolation?**
Require verified auth, load the object, check owner or active workspace membership, return 404 on failure, validate `workspace_id` on insert, add RLS policies for scans/findings, and test cross-user access.

### Security testing

**Q41. What checks does AEGIS run?**
TLS/HTTPS (30), security headers (20), leakage (25), reputation (25).

**Q42. Why is CSP not failed on JSON?**
CSP protects browsers rendering documents. A JSON response isn't rendered, so failing it would be a false positive. It is N/A (or a bonus if present).

**Q43. How is the score calculated?**
`earned / assessed × 100`; inconclusive tests are excluded from `assessed`; coverage = `assessed / 100`.

**Q44. What does a score of 100 with 75% coverage mean?**
Everything that could be tested passed, but one domain (usually reputation) could not be assessed. It is not proof of full security.

**Q45. What is SSRF and how do you prevent it?**
Server-Side Request Forgery. AEGIS uses scheme allowlisting, credential rejection, DNS resolution, private/loopback/metadata IP blocking, redirect re-validation and bounded responses. Residual risk: DNS rebinding; fix by pinning the validated IP.

**Q46. How do you stop secrets leaking into reports?**
Header and text redaction, sensitive-key detection, redacted evidence, PDF text sanitisation. Gap: the raw response body in `result_json` is not redacted.

**Q47. How do you avoid destructive scans?**
Default GET; destructive OpenAPI methods require `confirm_destructive=true`; path params are allowlisted; auth headers are ephemeral.

**Q48. What security tests would you add to AEGIS itself?**
JWT forgery/expiry tests, IDOR tests, rate-limit tests, SSRF rebinding tests, dependency scanning, secret scanning, SAST, DAST, and a security-headers check on AEGIS's own API.

### Latency / performance

**Q49. Explain the latency graph.**
Five sequential GET probes, 300 ms apart, 15 s timeout; min/avg/max and failures; observational only. See Section 11.

**Q50. Why not 100 samples?**
Runtime and target load. Five gives a quick signal; 20–30 with warm-up and percentiles would be better for benchmarking.

**Q51. Does latency affect the security score?**
No. They are separate dimensions.

**Q52. What is p95?**
The value below which 95% of requests fall. It captures tail latency that an average hides.

### Frontend

**Q53. How does React get scan updates?**
`useScan` polls every 2 s until `completed`/`failed`, then fetches findings and visualisations once.

**Q54. Why React Context?**
Only two global concerns (auth, workspace); Context avoids prop drilling without Redux overhead.

**Q55. How is the flow diagram built?**
The backend emits nodes/edges from real `scan_events`; the frontend lays them out with Dagre and renders with React Flow.

**Q56. How is accessibility handled?**
Skip links, semantic landmarks, `aria-live` status, focus styles, keyboard-operable modals, reduced-motion support.

### Design / trade-offs / behavioural

**Q57. What is the biggest weakness?**
Backend auth/authorization: unverified JWT/`X-User-Id` trust and missing ownership checks. Then dual-write consistency and in-process background jobs.

**Q58. What would you do with two more weeks?**
Verified JWT auth + ownership checks + RLS for scans/findings; a Redis queue with workers; rate limiting; redact the stored body; Alembic; CI with tests, SAST and dependency scans.

**Q59. How would you handle 1 million scans/day?**
Queue + autoscaled workers, Postgres, Redis cache, object storage, SSE instead of polling, per-tenant quotas, sharded workers by region, and observability with SLOs.

**Q60. What did you learn?**
How to turn a security idea into a safe system: validate untrusted URLs, bound outbound requests, never trust client identity, separate evidence from scoring, and design for explainability.

---

## 18. Demo script

### Before the demo (checklist)

- [ ] Backend running on `:8000`, frontend on `:3000`.
- [ ] `GET /api/health` returns `database: ok`.
- [ ] Supabase env configured (or know that the app falls back to guest mode).
- [ ] One completed scan already in history (network fallback).
- [ ] Browser zoom 100%, dark theme, notifications off.
- [ ] Have `result_json_sample.json` ready as a backup.

### The 5-minute flow

1. **Landing page (20 s):** "AEGIS is an API security scanner. It observes, scores and explains — it does not exploit."
2. **Sign in (20 s):** show email/password or Google. Mention Supabase Auth + JWT.
3. **Dashboard (30 s):** enter `https://api.github.com` (or `https://httpbin.org/get`). Click scan. Point out the 202 + polling.
4. **While it runs (30 s):** explain the pipeline: SSRF validation → request → 4 checks → score → latency → flow → persist.
5. **Results (90 s):**
   - Score dial + coverage. "100 with 75% coverage means reputation wasn't assessable."
   - Click a failed header: show evidence, why it matters, remediation, OWASP reference.
   - Latency chart: "5 sequential probes; average line; red dot means failure."
   - Flow diagram: "these nodes are real events, not decoration."
   - Request inspector: "headers are redacted."
6. **History (30 s):** open a previous scan, compare two scans, explain new/not-detected/severity-changed.
7. **Spec analyzer (30 s):** upload a small OpenAPI YAML, show endpoints, pick a GET operation.
8. **Team (20 s):** workspace switcher, roles, invite flow, mention RLS.
9. **PDF (20 s):** download the report; point out limitations section.
10. **Close (20 s):** "The architecture is a modular monolith; the next step is verified JWT auth, queue-based workers and stronger tenant isolation."

### If the network fails

- Show `result_json_sample.json` / `scan_sample.json`.
- Walk through the code path in `scan_service.py`.
- Explain that the scanner intentionally fails closed (timeouts, size caps).

---

## 19. Known limitations (say these before they find them)

Use this structure: **"Today it does X; the limitation is Y; the fix is Z."** That turns a weakness into engineering maturity.

| # | Limitation | Why it matters | Fix |
|---|---|---|---|
| 1 | Backend trusts `X-User-Id` and does not verify JWT signatures | Account impersonation | Verify JWT via JWKS; remove header trust |
| 2 | Read/report/compare endpoints have no ownership checks | IDOR/data leak | Require auth + owner/workspace check; 404 on denial |
| 3 | `workspace_id` accepted without membership validation | Cross-tenant writes | Validate membership before insert |
| 4 | Frontend `ProtectedRoute` redirect is commented out | UI open to guests | Re-enable redirect; keep RLS |
| 5 | History "workspace" scope actually filters only by user | Team history is incomplete | Join membership and filter by workspace |
| 6 | Dual writes to SQLite and Supabase | Inconsistent copies | Single source + outbox/queue |
| 7 | Background tasks in the web process | Lost on restart; no backpressure | Celery/RQ/Arq + Redis |
| 8 | Request-scoped DB session passed to background task | Fragile session lifecycle | Open a fresh session inside the task |
| 9 | Raw response body stored unredacted | Secret retention | Redact/truncate before persistence |
| 10 | DNS rebinding after validation | SSRF bypass | Pin validated IP / egress firewall |
| 11 | No rate limiting/quotas despite config | Abuse/DoS | Redis token bucket per user/IP |
| 12 | In-memory spec cache | Lost on restart; not shared | Redis/Postgres |
| 13 | `asyncio.create_task` fire-and-forget sync | Lost/duplicated sync, no retry | Queue + retries + DLQ |
| 14 | No Alembic | Schema drift | Add migrations |
| 15 | Header N/A points still counted in denominator | JSON APIs capped at 14/20 | Return `assessed_max_points` |
| 16 | No audit log for security-relevant actions | Non-repudiation | Append-only audit table |
| 17 | No scheduling/continuous monitoring | Point-in-time only | Cron/queue + diff alerts |
| 18 | No SSO/SAML/MFA | Enterprise gap | Supabase MFA/SSO |
| 19 | Public storage bucket URLs | Artefact exposure | Private bucket + signed URLs |
| 20 | Docker healthcheck uses missing `curl`; volume at `/app` hides code updates | Ops reliability | Python healthcheck; mount only DB dir |

**If asked "is your project secure?"** answer: *"The scanning pipeline is defensively designed — SSRF validation, bounded requests, redaction, non-destructive defaults. The platform's own auth/authorization layer is the weakest part, and I can name the exact gaps and fixes. I would not call it production-ready until those are closed."* That is a strong, honest answer.

---

## 20. Facts and numbers to memorise

| Fact | Value |
|---|---|
| Score range | 0–100 |
| Weights | TLS 30, Headers 20, Leakage 25, Reputation 25 |
| Statuses | pass, fail, warning, inconclusive, not_applicable |
| Severities | critical, high, medium, low, informational |
| Confidence | confirmed, likely, possible, inconclusive |
| Latency samples | 5 sequential, 300 ms apart |
| Timeout | 15 s (default) |
| Max response | 512 KB |
| Max redirects | 5 |
| Max spec size | 2 MB |
| Spec cache | 100 entries, in memory |
| Poll interval | 2 s |
| API tests | 79 collected, 75 pass without live tests, 4 live |
| Backend | Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, HTTPX 0.27 |
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Recharts, React Flow |
| Auth | Supabase Auth (JWT), Google + GitHub OAuth |
| Roles | Owner, Admin, Member |
| Storage | SQLite local + Supabase Postgres/Storage |
| Deploy | Docker Compose, Nginx, non-root backend, port 80/8000 |
| Score grades | ≥90 A+, ≥75 B, ≥50 C, <50 F |

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **API** | Contract allowing software to talk to software over HTTP. |
| **REST** | Resource-oriented HTTP API style using methods/status codes. |
| **JWT** | Signed JSON token carrying claims. |
| **Claim** | A field in a JWT (`sub`, `exp`, `aud`). |
| **OAuth 2.0** | Delegated authorization protocol. |
| **OIDC** | Identity layer on OAuth (ID token). |
| **PKCE** | Proof Key for Code Exchange; protects the auth code flow. |
| **Scope** | Permission requested from an OAuth provider. |
| **RBAC** | Role-Based Access Control. |
| **RLS** | Row Level Security in Postgres. |
| **SSRF** | Server-Side Request Forgery. |
| **IDOR** | Insecure Direct Object Reference. |
| **XSS** | Cross-Site Scripting. |
| **CSRF** | Cross-Site Request Forgery. |
| **CORS** | Browser policy controlling cross-origin requests. |
| **HSTS** | Header forcing HTTPS. |
| **CSP** | Content-Security-Policy; restricts resource loading. |
| **MIME sniffing** | Browser guessing content type; blocked by `nosniff`. |
| **Clickjacking** | Framing a site to trick clicks; blocked by X-Frame-Options/CSP. |
| **TTL** | Time To Live; cache/expiry duration. |
| **ORM** | Object-Relational Mapper (SQLAlchemy). |
| **Migration** | Versioned schema change. |
| **Transaction** | Atomic unit of DB work. |
| **Index** | Lookup structure speeding queries. |
| **Foreign key** | Referential constraint between tables. |
| **Cascade** | Automatic delete/update of dependent rows. |
| **Idempotency** | Repeating an operation has the same effect. |
| **Outbox** | Pattern for reliable event publishing. |
| **Circuit breaker** | Stop calling a failing dependency temporarily. |
| **DLQ** | Dead-Letter Queue for failed jobs. |
| **p50/p95/p99** | Latency percentiles. |
| **SLO/SLA** | Service level objective/agreement. |
| **Observability** | Logs, metrics, traces. |
| **SAST/DAST** | Static/Dynamic application security testing. |
| **Rate limiting** | Restricting request frequency. |
| **Least privilege** | Grant only the minimum access needed. |
| **Defence in depth** | Multiple independent security layers. |
| **TOCTOU** | Time-of-check to time-of-use race (DNS rebinding). |

---

## 22. File map: where to look for what

```
backend/app/
├── main.py                     FastAPI app, CORS, lifespan, /docs
├── config.py                   Pydantic settings from .env
├── database.py                 async engine, session, create_all, ALTERs
├── schemas.py                  all Pydantic request/response models
├── api/
│   ├── auth.py                 UserContext + (unverified) JWT decode
│   └── routes.py               all HTTP endpoints
├── models/
│   ├── scan.py                 Scan ORM
│   └── finding.py              Finding ORM + cascade
├── scanners/
│   ├── tls_checker.py          30 pts
│   ├── headers_checker.py      20 pts, context-aware
│   ├── leakage_checker.py      25 pts, regex rules
│   └── reputation_checker.py   25 pts, VT/GSB
├── security/
│   ├── url_validation.py       SSRF allow/block lists
│   └── redaction.py            header/text/key redaction
└── services/
    ├── scan_service.py         pipeline orchestration
    ├── operation_scan_service.py OpenAPI operation validation
    ├── scoring.py              earned/assessed/coverage
    ├── visualization_service.py latency + flow graph
    ├── report_service.py       ReportLab PDF
    ├── history_service.py      history + comparison
    ├── openapi_service.py      spec parse + LRU cache
    └── supabase_sync.py        REST/Storage sync

frontend/src/
├── App.tsx                     routes + providers
├── contexts/AuthContext.tsx    Supabase session
├── contexts/WorkspaceContext.tsx team state + roles
├── hooks/useScan.ts            create + poll + fetch extras
├── services/api.ts             Axios + JWT interceptor
├── services/supabaseService.ts scans/findings/specs/storage
├── services/workspaceService.ts workspaces/members/chat/tasks
├── components/                 Layout, ScoreCard, charts, flow, inspector
├── components/ui/              design-system primitives
└── pages/                      Landing, Auth, Dashboard, Results, History,
                                Team, SpecAnalyzer, OperationScan, Settings

docs/PROJECT_STRUCTURE.md       architecture + request tracing
backend/migrations/*.sql        Supabase RLS + chat/tasks
README.md                       features, stack, scoring, SSRF, endpoints
```

---

## Final advice for the viva

1. **Lead with the problem and the safety model**, not the code.
2. **Draw the architecture** on paper: Browser → Nginx → FastAPI → services → scanners → DB → external APIs.
3. **Trace one scan from click to PDF.** This is the single most convincing thing you can do.
4. **Define every term you use** (JWT, RLS, SSRF, idempotency) in one sentence.
5. **Separate "what it does" from "what it does not do."** Scanners are judged by honesty, not marketing.
6. **Own the limitations.** Say "today it does X; the gap is Y; I would fix it with Z." Examiners reward this far more than pretending there are no gaps.
7. **Never claim the score proves security.** It measures observed evidence.
8. **If you don't know, say:** "I haven't implemented that yet. My understanding is …, and I would verify it by …". Confidence without honesty is the only fatal answer.

Good luck — you know this project better than you think.
