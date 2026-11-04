# Seller inbox API contract adapter (frontend)

This maps the Backend `GET /v1/me/seller-requests` native/server bearer-only response into the existing `SellerRequestList` view-model, after validating UUID, status, version, timestamps and pagination. It deliberately projects a safe allowlist of fields, never customer/guest contact, note, capability, request owner IDs or private allocation details. The previous view-model's `desiredStartAt` is left null: the backend's `scheduled_start_at` represents a different business fact and must not be relabeled.

The same module validates exact replies from the new POST accept/decline endpoints. The adapter never fetches, creates a session, reads cookies, provides a seller role or marks a request successful. It is not yet mounted; secure same-origin BFF with login, CSRF/Origin and server-side authorization must be implemented before connecting it.

Backend references: `services-back` PR #17 (seller inbox integration) and PR #18 (idempotent seller mutation); canonical docs PR #10. Merge and verify those independently before deploying a connected UI.
