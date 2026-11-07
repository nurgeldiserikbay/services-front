# Seller workspace stale-private-state protection

This PR builds on the protected seller workspace PR #41. It is deliberately **stacked on that feature branch**, and must be merged after #41 (or retargeted after #41 merges).

## Stage 1 — clear private inbox on failed revalidation

When the live BFF inbox read fails, the client no longer keeps the previously fetched seller requests, cursor, and CSRF-bearing page in memory as a visible snapshot. For a backend 401, the account is treated as signed out and pending mutation keys are erased. Network errors and other failures clear the visible private snapshot as well, because the browser cannot prove the user's current scope remains valid.

This does not replace backend authorization: the server still verifies each account session and seller ACL. A network outage does not revoke a session; this change simply stops displaying old private data until the next successful authenticated refresh.

## Stage 2 — uncertain accept/decline results

If an accept/decline request times out or produces an unavailable outcome, the UI hides old request rows. It intentionally **retains the original idempotency key** in transient React memory: users should re-fetch the server state, then use the same key when retrying the exact same request action/version. It does not report the mutation as successful and never optimistically changes the request status. Expired sessions clear all keys.

## Stage 3 — regression and rollout boundaries

Automated tests verify backend 401 classification, generic failures, no false success for uncertain writes, stable idempotency payloads, and fail-closed view handling. The code still requires the registered seller workspace feature flags, real account login/OTP provider, same-origin BFF cookie, and live browser E2E before production enablement.

This change intentionally prioritizes privacy over offline inbox usability. No new price negotiation, appointment confirmation or service-provider billing behavior is introduced.
