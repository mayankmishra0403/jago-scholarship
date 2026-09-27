# JagoScholarship

**SIH PS 26238 — Unified Scholarship Module for Scheduled Tribe Students**

One record, checked once, against all five Ministry of Tribal Affairs ST scholarship
schemes — with the reasoning shown to the student, the reviewer and the Ministry.

> A tribal student applying for a pre-matric scholarship today visits the National
> Scholarship portal, the state e-District site, UDISE+ and their institute, re-entering the
> same Aadhaar number and the same income certificate each time, and learns about a
> rejection weeks later. This collapses that into one window, and shows the answer *before*
> the deadline rather than after it.

---

## Repository and deployment

- Source: <https://github.com/mayankmishra0403/jago-scholarship> (public)
- Production: <https://238-bay.vercel.app>
- Vercel project `238` (team `mayankmishra0403s-projects`), framework detected as Vite, with
  `main` as the production branch. Vercel is connected to the GitHub repository, so a push to
  `main` deploys; a pull request gets a preview.

Supabase config is supplied as build-time variables, because Vite inlines them:

| Variable | Scope | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build | project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build | publishable key only — never a service-role key |
| `VITE_DEV_ROLE_SWITCH` | build | enables the "view as" switcher for the demo |
| `VITE_DEV_SIMULATOR` | build | enables the connector failure simulator |
| `VITE_UIDAI_GATEWAY_URL` | build | **intentionally unset** — see "Aadhaar verification" |
| `UIDAI_GATEWAY_URL`, `UIDAI_CLIENT_ID`, `UIDAI_CLIENT_SECRET` | runtime, server only | unset; no partner agreement yet |

The publishable key is safe in a browser by design and is the only credential the client
receives. `api/` is deployed as a Vercel function, so `GET /api/identity/aadhaar` answers
`{"ok":true,"configured":false}` until gateway credentials exist — which is the honest state
of the integration, reported rather than papered over.

### Migrations

Eleven migrations in `supabase/migrations/` take an empty project to the current state,
including the seeded demo cohort, the reviewer queue, and the four security migrations that
close the `is_demo` privacy hole and revoke the trigger-function RPC paths. They are written
idempotently (`ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`) so re-running is a no-op, which
is what makes them safe to apply to a database that is already seeded.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5178
```

No login is needed to *look* at it: the app boots with a deterministic demo persona and
hydrates from Supabase in the background if it can reach it. Sign-in is real and available at
`/login`, but see "Sign-in" below — it needs one dashboard toggle first.

```bash
npm run build      # tsc -b && vite build  (typecheck is part of the build)
npm test           # 116 tests
```

### The demo role switcher

The `Student / Reviewer / Ministry` switch in the header is a **presentation affordance only**.
It changes which screens render; it grants no data access. Every read still goes through
Supabase RLS, so the reviewer console comes up empty unless the session is genuinely a staff
session — and says so on screen rather than inventing a queue. This is deliberate: a
prototype that fakes privileged data teaches the wrong thing.

---

## What is in the box

| Area | Where |
| --- | --- |
| The five schemes, rules and institutions | `shared/catalogue.ts` |
| Eligibility engine (22 rules, explainable) | `shared/eligibility.ts` |
| Mock government connectors | `shared/connectors.ts` |
| Deterministic demo persona | `shared/demo.ts` |
| Database access (RLS-respecting) | `src/data/repository.ts` |
| App state | `src/store/app.tsx` |
| Screens | `src/pages/`, `src/components/` |
| Schema and policies | `supabase/migrations/` |

### Screens

- **Home** — eligibility across all five schemes at once, side by side.
- **Schemes** — per-scheme verdict with every check expanded: expected, actual, which
  government system was asked, and how to fix it.
- **Wallet** — document provenance. Every paper records *where it came from* (upload,
  DigiLocker, e-District, UDISE+, AISHE) and whether it can be reused across schemes.
- **Apply** — four-step wizard that carries documents across, so nothing is uploaded twice.
- **Track** — application and sanction status including PFMS returns.
- **JAGO** — the assistant. See below.
- **Reviewer** — risk-ordered queue, with the reviewer reasoning stated.
- **Ministry** — UDISE+-based coverage across 13 states, plus the outreach targeting list.
- **Simulator** — take a government source down and watch the verdict degrade honestly.

---

## Three decisions worth defending

### 1. An outage is not a pass

If a government source is unavailable, the affected checks become `skipped` **with a named
owner**, and a scheme that depends on them stops being auto-sanctionable. A rule engine that
treats "could not check" as "no problem" will happily sanction a student it never verified.
The simulator exists to demonstrate this on stage.

### 2. Rules decide the clear cases; people decide the ambiguous ones

A student who passes every check is sanctioned without a human. The reviewer queue is ordered
by risk score, which is a plain function of blockers, warnings and document state — never a
black box, and never a proxy for a student's tribe or category. Name variants (Kondh/Hansdah
style transliteration differences) are routed to a reviewer as a *question*, not auto-rejected,
because in these records they are the normal case.

### 3. JAGO refuses rather than guesses

Every JAGO answer is tagged with its basis: **from your record**, **from the scheme rules**,
or **I do not know this**. Eligibility answers come from the same engine that produced the
verdict on the Home screen, so the two can never disagree. Anything unanswerable gets an
admission and a pointer to the district office. A generated answer that cannot be attributed
to a rule or a record is worse than an admission, because a student will act on it.

---

## Languages

English and Hindi carry the full interface. Six tribal languages — Santali, Kui,
Oraon/Kudukh, Mundari, Gondi and Saora/Sora — cover the JAGO assistant, scheme explainers and
eligibility reasons, and the language picker labels them as **"Assistant & explainers"** rather
than full translation. The app never implies a translation it does not have.

---

## Data and security

- Supabase, RLS on every public table. No service-role key ships to the client.
- PII is split out: `student_private` holds family income and bank details, and is reached
  only through the `security_invoker` view `v_student_profile`.
- `v_student_active_schemes` and `v_coverage_cohorts` are `security_invoker`, so a view cannot
  become a back door around the policies on the tables beneath it.
- The demo cohort is a synthetic `is_demo` read-only carve-out. **Writes still require a real
  Supabase Auth session** — without one, the app returns `null` and falls back to local demo
  data rather than pretending a write succeeded. `is_demo` is writable only by `service_role`
  or staff: a trigger pins it, because one `PATCH {"is_demo": true}` would otherwise move a
  real student's income, institution and review reasons into world-readable, and the insert
  and update policies both permitted the column.
- Trigger functions (`handle_new_auth_user`, `protect_profile_role`, `audit_staff_write`) are
  not executable by `anon` or `authenticated`. Revoking from `PUBLIC` alone is not enough on
  Supabase, because the grants to those roles are explicit. `is_staff()` and `current_app_role()`
  are left callable on purpose — RLS policies evaluate as the invoking user, so revoking them
  would break every policy, and each only reveals the caller's own role.
- `coverage_records` (1,618 matched sample records) is staff-only. State and scheme coverage is
  public because it is published aggregate data with no personal information in it.
- Every database read has a 6-second deadline. A demo on conference wifi degrades to local data
  instead of spinning forever.

### Coverage data

`v_coverage_matrix` joins 1,618 deterministically generated sample records (0.09% of the ST
student universe) onto UDISE+ state head-counts dated 31 March 2024, giving 65 state × scheme
rows: 8,990,000 projected ST enrolled, 1,465,550 PVTG, 5,233,040 unreached. **The sample is
synthetic and the projections are illustrative** — they demonstrate the shape of the problem at
national scale, and they are labelled as such in the UI. They are not official statistics.

---

## Sign-in

Passwordless, by email one-time code. There is no password field, no reset link, and no
`supabase-js` — `src/lib/supabase.ts` is a small PostgREST + GoTrue client, which is what
keeps the realtime layer out of the bundle.

**Enabling it is a dashboard step, not a code step.** In Supabase → Authentication → Providers,
enable **Email** and turn on **Email OTP**. Until then GoTrue answers:

```json
{ "error_code": "otp_disabled", "msg": "Signups not allowed for otp" }
```

which surfaces as an `AuthError` rather than a silent no-op. Custom SMTP is strongly advised —
the default email provider is rate-limited to a handful of staff logins per hour, and a demo
where the third judge cannot sign in is a demo that fails in front of the panel.

Creating a staff account, since roles are not self-assignable:

```sql
update public.profiles set role = 'reviewer' where id = (
  select id from auth.users where email = 'you@example.com'
);
```

The `protect_profile_role` trigger blocks that write for a signed-in student, and permits it
only for an admin or a service-side context (`auth.uid() is null`).

### Where the role comes from

`profiles.role`, read over RLS — never from local state. The header's role switcher changes
which screens render and nothing else. When Supabase is unconfigured the app falls back to a
local demo persona so it still runs offline; when it *is* configured, the switcher is a
presentation affordance only and staff routes redirect to sign-in for anonymous visitors.

---

## Aadhaar verification

There is no public Aadhaar verification API. UIDAI issues credentials only to registered
gateway partners, requiring a registered entity, an Aadhaar KYC licence and a signed
agreement. So the screen ships in two modes and always says which one it is in.

**Simulated (default).** Runs the Verhoeff check digit and returns a fixed sample response.
Two fixtures exercise both branches, and both are tested to be reachable:

| Fixture | Result |
| --- | --- |
| `2108 0000 0126` | matches, returns the name on the register |
| `9999 9999 9999` | "not on the register" |

**Live.** Set `VITE_UIDAI_GATEWAY_URL=/api/identity/aadhaar` and configure the server-side
variables:

```bash
UIDAI_GATEWAY_URL=https://auth.uidai.gov.in/v2/aadhaar/auth
UIDAI_CLIENT_ID=...            # issued under the partner agreement
UIDAI_CLIENT_SECRET=...
```

**Note the absence of the `VITE_` prefix, which is the whole point.** Every `VITE_*` variable
is inlined into the JavaScript bundle and served to every visitor, so a partner secret behind
that prefix is a published secret — the kind of mistake that ends an agreement rather than
merely embarrassing the team. The browser therefore holds no credential at all: it posts the
number to `api/identity/aadhaar.ts`, which attaches `client_secret` server-side and never
returns the full number. `resolveProvider()` accepts no field in which a secret could be
supplied, so the leak cannot be reintroduced by a well-meaning config change, and a test scans
the source for `import.meta.env.VITE_*SECRET*` to keep it that way.

The endpoint reports an unconfigured gateway as `501 not_configured`, which the client renders
as *"not configured"* rather than *"no match"*. Telling a real student that their Aadhaar
failed because an integration is switched off is a serious harm, and it is the easiest mistake
to make in this file.

**Not yet implemented:** rate limiting and per-user attempt caps. This is a deliberate
blocker, not an oversight — without it, the endpoint would let anyone burn the partner quota
brute-forcing an Aadhaar number, which is worse than a verification that does not work.

Aadhaar is a restricted identifier under s.57 of the Aadhaar Act 2016: a private app may not
*display* or *store* a full number. It is transmitted to a registered gateway, because that
consented request is what a check is. The app keeps only the last four digits and the result.

DigiLocker's OAuth flow is public and free and is wired as far as generating the consent URL;
the callback and code exchange are not implemented.

---

## Government integrations

All connectors are **mocked** behind one `ConnectorContext` interface, with deterministic
latency, seeded failure injection and realistic partial responses (a PFMS return code, a
DigiLocker name mismatch). The app never claims to be talking to a live government system.
Swapping a mock for a real API means implementing one interface and changing
`schemeNeeds(connector)`.

---

## Tests

```
tests/eligibility.test.ts        39  rule outcomes, name matching, document rules, risk scoring
tests/identity.test.ts           23  Verhoeff checksum, demo fixtures, gateway request, bundle hygiene
tests/smoke/auth.test.tsx        18  OTP send/verify, refresh, logout, staff guard, AuthError mapping
tests/smoke/render.test.tsx      15  every route renders, role boundaries, no console errors
tests/postgrest.test.ts          13  hand-rolled client: exact URLs, methods, headers, error mapping
tests/aadhaar-endpoint.test.ts    8  the server endpoint: unconfigured vs failed, no number echoed
```

The smoke test exists because a passing build is not a working app: it caught
`AppProvider` never being mounted and the role switcher stranding users on a screen they
could not leave. Both would have shipped a broken demo with a green build.

Two of the later additions exist for the same reason — because the bug was invisible:

- **`identity.test.ts` asserts the advertised demo numbers are usable.** The miss fixture read
  `9999 9999 9999 9999` — four groups of four, sixteen digits — so it was rejected on length
  before it reached the branch it existed to demonstrate. The demo looked like a broken
  verifier. The fixture is now tested for digit count as well as checksum.
- **`identity.test.ts` checks every staff simulator id against the connector registry.** Two
  toggles addressed ids no connector reports (`nta` for `ugc_nta`, `nsp` for `otr`), and
  `simulateFailure` matches on the connector's own id, so they rendered, looked live, and did
  nothing. A panel whose job is to demonstrate failures must not contain dead switches.

---

## Known limits

- District-level outreach data is staff-gated, so the Ministry drill-down is empty without a
  staff session. This is the intended security posture, not a bug.
- Email sign-in is implemented end to end but **cannot work until Email OTP is enabled** in the
  Supabase dashboard, and production mail needs custom SMTP. See "Sign-in" above.
- Document upload writes a local placeholder record; real Supabase Storage is not wired up.
- The Aadhaar endpoint has no rate limiting, so it must not be pointed at real UIDAI
  credentials until that is added. See "Aadhaar verification".
- The DigiLocker callback and code exchange are not implemented, so the consent link is inert.
- Leaked-password protection is off in Supabase Auth. It only affects password sign-in, which
  this app does not use, so it is left as a dashboard toggle rather than a change here.
- Capacitor is configured (`npm run build:android`) but the native project is not yet
  initialised, and the local machine has no `ANDROID_HOME` set.

---

## Testing

```bash
npm test            # 116 tests, ~1.3s
npm run test:watch  # re-runs on save
npm run lint        # typecheck only (tsc -b)
npm run build       # typecheck + production build
```

`npm test` runs six suites:

| Suite | Count | What it protects |
| --- | --- | --- |
| `tests/eligibility.test.ts` | 39 | Rule outcomes across all five schemes — income ceilings, class levels, held scholarships, institution notification, name transliteration, Aadhaar/bank cross-checks, risk scoring, and the rule that a **source outage routes to manual review instead of silently failing a student**. |
| `tests/smoke/render.test.tsx` | 15 | Every route renders without a console error, and the role boundaries hold — a student cannot reach the Ministry screen. |
| `tests/identity.test.ts` | 23 | Verhoeff catches every single-digit typo and every adjacent transposition; the demo fixtures are usable; the gateway request carries no credential. |
| `tests/smoke/auth.test.tsx` | 18 | OTP send/verify, refresh, logout (bearer, not a body), staff redirect for anonymous users, `AuthError` mapping. |
| `tests/postgrest.test.ts` | 13 | The hand-rolled client hits the exact URL, method and headers, and maps status codes to errors — a silent mistake there reads as "the demo is offline". |
| `tests/aadhaar-endpoint.test.ts` | 8 | The server endpoint separates *unconfigured* from *failed*, never echoes the number, and puts it in the body rather than the URL. |

### Manual pass — the ten-minute demo script

```bash
npm run dev     # http://localhost:5178
```

1. **Home** — five scheme verdicts side by side, with readiness, blockers and applications
   as stat tiles. Open the browser console first: it should be clean.
2. **Schemes** — expand a scheme. Every check shows *expected*, *actual*, **which government
   system was asked**, and a fix. The ST-certificate check should read as a transliteration
   variant for reviewer confirmation, not a rejection.
3. **Wallet** — the expired income certificate is flagged; provenance per document is shown.
4. **Switch role to Reviewer** — the queue loads. With no staff session it says *"RLS is doing
   its job"* and falls back to the local demo application. That empty state is correct, not a
   bug.
5. **Ministry** — 65 state × scheme rows, ~8.99M projected ST enrolled, filters by state and
   scheme. The district drill-down is intentionally empty (staff-only); read the message.
6. **Simulator** — flip **e-District** off, hit *Re-run all*, then re-run checks on Schemes.
   The affected checks flip to `skipped` with a named owner. **This is the demo's best moment**
   — it proves an outage is never read as a pass.
7. **JAGO** — ask *"Which scheme am I eligible for?"* (answered *from your record*),
   *"How do I renew my income certificate?"* (*from the scheme rules*), then something absurd
   like *"What is the weather in Bhubaneswar?"* — it refuses and says why.
8. **Language picker** — switch to Santali or Kui. Assistant text is translated; the picker
   labels the tier honestly as *"Assistant & explainers"*.
9. **Narrow the window** — the bottom tab bar appears under `md`; the sticky JAGO input must
   not be covered by it.

### Testing the failure paths

The interesting behaviour is what happens when things break, so test those deliberately:

- **Stop Postgres** (or block the network) and reload. The app must fall back to local demo
  data and say so in the footer, not spin forever — every read has a 6s deadline.
- **Empty the `v_review_queue`** and open Reviewer: you get the honest empty state.
- **Set a lapsed `income_certificate_valid_till`** in the demo profile and re-run: the income
  rule must fail with a renewal hint, not a generic rejection.
- **Change the ST certificate spelling** in the wallet: the check must become `review`, not
  `fail`. A one-character Kondh/Hansdah variant is the normal case, not fraud.

### Checking the database side

```bash
# public aggregate — 65 rows
curl -s "$VITE_SUPABASE_URL/rest/v1/v_coverage_matrix?select=state_ut,scheme_code,coverage_pct" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" | python3 -m json.tool | head

# demo student only — 1 row
curl -s "$VITE_SUPABASE_URL/rest/v1/v_student_profile?select=full_name" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```

Expect `v_review_queue` and `v_coverage_cohorts` to return **0 real rows** to an anonymous key.
That is the RLS working, not a failure. Verify with a staff session or via SQL.

### Android

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
npx cap add android     # first time only — the native project does not exist yet
npm run cap:sync
npm run android:open   # or: npm run android:apk
```
