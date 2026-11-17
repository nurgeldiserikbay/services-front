# Staging acceptance evidence (release gate)

Status: **NOT VERIFIED**. This checklist does not authorize production deployment.

## Immutable revision record

Record the exact SHA and successful GitHub Actions run URL for each repository. The mechanical verifier requires CI links in the **matching** `nurgeldiserikbay/services-back`, `services-front`, and `services-admin` repositories; revision dates must be real UTC calendar dates (YYYY-MM-DD), not free-form timestamps. Evidence URLs must be HTTPS without credentials, tokens in query strings or fragments. These format checks do **not** verify that a run actually succeeded or tested the recorded SHA: the release owner must independently inspect each run, SHA, artifact, environment and approval before switching the status to VERIFIED. The known cross-repository CI pair is documented in [integration-release-gates.md](integration-release-gates.md); it is not a substitute for staging acceptance.

| Component | Staging SHA | CI run URL | Verified by | Date (UTC) |
| --- | --- | --- | --- | --- |
| Backend | TODO | TODO | TODO | TODO |
| Frontend | TODO | TODO | TODO | TODO |
| Admin | TODO | TODO | TODO | TODO |

## CI revision provenance (online pre-approval gate)

After recording immutable Backend, Frontend and Admin SHAs and genuine successful GitHub Actions run URLs, run the read-only online provenance verifier:

```bash
node scripts/verify-staging-ci-provenance.mjs docs/staging-acceptance-evidence.md
```

It first requires the complete mechanical evidence record, then queries **only** GitHub Actions REST endpoints for the three approved project repositories. Every run must be HTTP 200, `completed`, `success`, belong to the expected repository and report `head_sha` exactly matching the staged revision. Rate limits, redirects, timeouts, malformed JSON or missing run status are **NO-GO**. The check performs no staging writes and sends no credentials. This does not prove which artifact was deployed, that manual gates were executed, or that the person listed as approver authorized release. Keep release status NOT VERIFIED until environment, security and operations sign-off.

## Required acceptance gates

Each gate requires its own dated, reproducible evidence URL (HTTPS). A shared evidence bundle is not sufficient by itself. Do not mark PASS based only on source code, a green unit test, or a screenshot without an execution trace.

| Gate | Required evidence | Result | Evidence URL |
| --- | --- | --- | --- |
| Authentication | Browser login, MFA enrollment/challenge, session expiry, CSRF rejection; no secrets in logs | NOT RUN | TODO |
| Guest-to-seller lifecycle | Authenticated request, seller decision, notification, cancellation and replay/concurrency checks | NOT RUN | TODO |
| Isolation | Two accounts and two organizations; cross-account read/write attempts rejected | NOT RUN | TODO |
| Admin moderation | Approved rollout flags, scoped permissions, audit event, logout invalidation, private no-store responses | NOT RUN | TODO |
| PWA and mobile | Offline fallback, cache invalidation, installability, accessibility, kk/ru and Capacitor device tests | NOT RUN | TODO |
| Data safety | Clean staging migration, repeat migration, backup restore, rollback rehearsal, KZ residency review | NOT RUN | TODO |
| Operations | Health/readiness, monitoring alerts, secret rotation, incident response and deployment rollback | NOT RUN | TODO |

## Execution procedure

1. Provision a non-production staging environment with separate accounts, secrets and test data. Never copy real personal data to staging.
2. Pin backend, frontend and admin to immutable SHAs; capture CI run links and dependency audit artifacts.
3. Apply committed migrations to an empty staging database, rerun migration deployment and verify schema. Do not execute destructive rollback against production.
4. Run authenticated browser/API E2E scenarios with two separate identities. Capture sanitized request IDs, timestamps and expected/actual status codes.
5. Verify privileged routes remain inaccessible when rollout flags are disabled. Enabling privileged features requires explicit approval.
6. Rehearse backup and restore on an isolated staging database; record recovery duration and integrity checks.
7. Verify PWA offline/update behavior on supported browsers and Capacitor on target devices.
8. Run an approved rollback rehearsal and validate health, metrics and alert delivery.
9. Attach evidence links, owner approvals and remaining risks before any production go/no-go decision.

## Read-only public HTTPS staging smoke (pre-acceptance)

When an isolated non-production HTTPS staging environment actually exists, an operator can run the non-destructive public readiness check from a trusted workstation:

```bash
STAGING_ALLOWED_HOST=staging.example.kz \
  node scripts/check-staging-public.mjs https://staging.example.kz
```

Replace the example hostname with the **approved, exact staging DNS hostname**. The script refuses HTTP, local/IP hosts, redirects, embedded credentials, non-root URLs, and missing host approval. It sends only bounded, unauthenticated **GET** requests to the localized public entry pages, PWA manifest, icon, offline fallback and service worker. It also checks the **actual HTTPS response headers** after staging reverse proxies/CDNs: `nosniff`, frame denial, COOP `same-origin`, restricted public referrer policy, disabled camera/microphone/geolocation permissions, and core production CSP on both localized pages. Missing headers are a staging public-readiness failure even when source-level Next.js tests pass. Production-mode frontend responses now set **host-only HSTS** (`max-age=31536000`), and the staging smoke requires at least six months of HSTS on each checked HTTPS response. The script rejects `preload`; do not enable `includeSubDomains`/preload without a separate domain-ownership and HTTPS rollout review. Reverse proxies/CDNs must preserve HSTS across HTTPS termination. A successful local unit test cannot certify these deployed headers. It uses 10-second request deadlines, a 256 KiB response ceiling and does not submit personal data, create requests, log in, or activate feature flags.

Record the staging origin (not any credential), test timestamp, frontend SHA, command, result and sanitized trace in the evidence record below. A green result is only **public frontend readiness evidence**, not proof of authentication, account isolation, security approvals, installed Android PWA, screen reader, Core Web Vitals, backend migrations, data residency or release sign-off. The gate remains **NOT RUN** until executed against the real approved staging environment and separately reviewed.

## Evidence record template

- Gate:
- Environment and region:
- Repository SHAs:
- Executed at (UTC):
- Operator/reviewer:
- Test command or manual steps:
- Sanitized artifact URL:
- Expected outcome:
- Actual outcome:
- PASS / FAIL / BLOCKED:
- Defect/issue URL:
- Retest SHA and date:

## Signed release evidence

- Evidence bundle: TODO
- Approved by: TODO
- Approved at (UTC): TODO

## Release decision

**Default: NO-GO.** Production is allowed only when all mandatory gates have PASS evidence, security findings are dispositioned, backup/restore and rollback are proven, and designated owners approve the release. A green CI workflow alone never overrides this decision.
