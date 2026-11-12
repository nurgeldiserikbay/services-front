# Staging acceptance evidence (release gate)

Status: **NOT VERIFIED**. This checklist does not authorize production deployment.

## Immutable revision record

Record the exact SHA and successful GitHub Actions run URL for each repository. The known cross-repository CI pair is documented in [integration-release-gates.md](integration-release-gates.md); it is not a substitute for staging acceptance.

| Component | Staging SHA | CI run URL | Verified by | Date (UTC) |
| --- | --- | --- | --- | --- |
| Backend | TODO | TODO | TODO | TODO |
| Frontend | TODO | TODO | TODO | TODO |
| Admin | TODO | TODO | TODO | TODO |

## Required acceptance gates

Each gate requires a dated, reproducible artifact or test report. Do not mark PASS based only on source code, a green unit test, or a screenshot without an execution trace.

| Gate | Required evidence | Result |
| --- | --- | --- |
| Authentication | Browser login, MFA enrollment/challenge, session expiry, CSRF rejection; no secrets in logs | NOT RUN |
| Guest-to-seller lifecycle | Authenticated request, seller decision, notification, cancellation and replay/concurrency checks | NOT RUN |
| Isolation | Two accounts and two organizations; cross-account read/write attempts rejected | NOT RUN |
| Admin moderation | Approved rollout flags, scoped permissions, audit event, logout invalidation, private no-store responses | NOT RUN |
| PWA and mobile | Offline fallback, cache invalidation, installability, accessibility, kk/ru and Capacitor device tests | NOT RUN |
| Data safety | Clean staging migration, repeat migration, backup restore, rollback rehearsal, KZ residency review | NOT RUN |
| Operations | Health/readiness, monitoring alerts, secret rotation, incident response and deployment rollback | NOT RUN |

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

## Release decision

**Default: NO-GO.** Production is allowed only when all mandatory gates have PASS evidence, security findings are dispositioned, backup/restore and rollback are proven, and designated owners approve the release. A green CI workflow alone never overrides this decision.
