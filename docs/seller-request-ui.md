# Seller request list UI foundation

Reusable mobile-first, localized kk/ru, accessible request inbox component. It receives server-filtered request summaries, the authenticated seller context and a mutation callback. It sorts pending requests first, renders accept/decline actions only in PENDING state and blocks duplicate clicks. A successful callback does not fabricate the next state: its caller refreshes server data.

Intentionally unmounted until the Backend has authenticated sessions, professional owner/company operator ACL, safe paginated request list and accept/decline endpoints, and notification delivery semantics. Never infer seller authorization from route params or a client-side role selection. No fee negotiation or unilateral calendar confirmation is implied.
