# Guest inquiry UI draft — dependency contract

This branch adds the first **presentation-only** step for a client inquiry. It supports kk/ru, phone/email selection, optional notes (max 1000), and consent. The module produces a validated **in-memory** draft via `onContinue`. The offer ID is supplied by the trusted page context and is not user editable.

**Not mounted in published pages.** The component intentionally does not submit, store contact, send SMS/email or claim an order. Do not mount it until the server BFF implements real OTP verification, protected guest capability transfer and the canonical POST /v1/guest-requests endpoint with rate limits. Secrets and request capabilities must never enter URLs, logs or local storage. Token transport and request idempotency are owned by BFF/server services, not this draft UI.

Connection sequence: offer page -> in-memory draft -> BFF OTP send (generic response) -> OTP verify -> BFF creates request transaction with Idempotency-Key -> request receipt -> optional read/cancel using request-scoped proof. Double-click and abort protections belong to the actual network step.

This UI is not a replacement for the services-admin privileged moderation workspace.
