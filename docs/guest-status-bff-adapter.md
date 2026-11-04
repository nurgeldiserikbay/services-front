# Guest status — private web BFF adapter

This change adds a **private, internal Next.js server-side adapter** to
retrieve the status of exactly one guest request, following backend PR #27.

The browser never receives or supplies the bearer secret. The BFF must read
`__Host-services_guest_request` using the trusted Next.js cookie store and
decrypt/validate it via the existing request-scoped AES-GCM session. Only
the matching request UUID can be read. Cross-site Fetch Metadata is
rejected. The internal HTTPS backend receives a `Guest-Capability` header
and no browser cookies, with a five-second timeout, no cache, no redirects
and strict JSON schema/size validation. The private result contains only
`id`, `serviceOfferId`, `state`, `version` and `createdAt`.

**No public Next.js route is mounted.** The backend status service added
in PR #27 is still internal and has no public GET controller. A future
route must enforce no-store, authentication, same-origin browser behavior,
negative enumeration cases, end-to-end resource authorization and private
page noindex. `READ_CANCEL` expiry requires original-contact recovery.

Server code must never put capability tokens in URL, serialized HTML, logs,
analytics, public cache keys or JavaScript. A guessed request UUID does not
grant access. The adapter tests use synthetic responses, not a live backend.
