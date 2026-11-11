# Frontend release compatibility gates

Status: **NOT VERIFIED**. This is a release gate, not proof of a green build.

## Reproducible dependencies — issue #65

- [ ] Generate and commit root `pnpm-lock.yaml` using pnpm 10.20.0 from committed workspace manifests.
- [ ] Change CI to `pnpm install --frozen-lockfile` only after committing the lockfile.
- [ ] Verify clean install on Node >=22.12, typecheck, tests, production build and dependency audit.
- [ ] Record the green CI URL and frontend SHA.

## Current backend compatibility — issue #66

Frontend CI currently pins backend SHA `73f77a7b85772b8f794ae8acd36c01290ac86537`; passing against this baseline does not establish compatibility with newer backend code.

- [ ] Record exact frontend and newer backend SHAs.
- [ ] Run an additional integration lane against that exact backend SHA using an isolated PostgreSQL DB and committed migrations.
- [ ] Check search-to-profile, guest request status, seller decision, admin denial and authentication boundaries.
- [ ] Validate API schemas, state transitions and private-data redaction.
- [ ] Retain pinned baseline until the new compatibility lane passes; update pin deliberately.
- [ ] Capture green workflow URL and migration output.

## Production release

- [ ] Backend, frontend and admin checks green at release SHAs.
- [ ] High/critical dependency audit findings resolved or formally accepted.
- [ ] Staging E2E, negative authorization tests, backup/restore and rollback verified.
- [ ] Record release SHA, test run URLs, timestamp and reviewer sign-off.

**Evidence rule:** Empty workflow-run or commit-status queries are not evidence of success.
