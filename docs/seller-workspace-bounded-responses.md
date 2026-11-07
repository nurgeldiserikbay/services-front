# Seller Workspace: bounded BFF response parsing

## Stage 1 — bounded private inbox and pagination

The legacy seller workspace no longer calls unbounded `Response.json()` for full inbox or cursor requests. A reusable, strictly typed (ES module plus `.d.mts`) reader accepts only HTTP 200, `application/json`, a safe declared Content-Length (if present), and a measured streamed body of at most 64 KiB. It rejects invalid UTF-8, invalid JSON, redirects, error pages and streaming response bodies that exceed the cap, even without a Content-Length header.

Both inbox loads retain server-side seller ACL; the browser calls only same-origin BFF with cookies, no-store, explicit redirect refusal and an 8-second timeout.

## Stage 2 — decision receipt integrity

Seller accept/decline actions accept only an exact 200 JSON object with one `outcome: 'ok'` field and a 1 KiB response cap. Extra fields, a fake status, an HTML login page, a redirect or malformed bytes never produce a successful decision. The original request-scoped idempotency key is preserved on ambiguous failures; the backend remains authoritative for mutations and optimistic concurrency.

## Stage 3 — CI and regression

Unit tests cover valid small responses, declared and actual streamed size, invalid UTF-8, error statuses, media types, redirects, forged ACKs and the fact that all three workspace fetch paths use the reader. `pnpm typecheck`, `pnpm test` and `pnpm build` are required to pass before merge.

This change does **not** enable currently feature-gated web login or OTP providers and does not alter scheduling, service prices or stored private contact data. The registered login/OTP provider and deployed-browser E2E are still release gates.
