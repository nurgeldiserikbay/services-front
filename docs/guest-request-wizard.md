# Private guest request flow UI (not publicly mounted)

A reusable client-side wizard composes the existing guest draft, OTP input and
private request receipt components. It has three distinct user actions:

1. **Draft → request challenge.** The parent must provide a secure same-origin
   BFF callback to validate input, enforce abuse budgets and send an OTP.
   No backend URLs or contact information are stored in localStorage or URLs.
2. **OTP → verified contact.** A separate callback verifies a six-digit code.
   A successful OTP is *not* interpreted as a created ServiceRequest.
3. **Send → committed receipt.** Only an authenticated, idempotent server
   response with a valid request UUID and state `pending` triggers the receipt.

A single idempotency key remains stable across retries after network errors
or uncertain COMMIT. The UI does not automatically consume OTP again if
the create call fails. Client-side duplicate-click guards are not a
substitute for the backend's transaction and uniqueness guarantees.

The parent must set/rotate HttpOnly cookies and use approved origin/CSRF
protections; this component never directly accesses a bearer capability.
The backend guest HTTP endpoints, Kazakhstan-resident OTP provider,
network/device budgets and end-to-end staging tests are **not** complete.
Therefore the component is **not mounted** on public offer pages.

This is UI composition and test coverage, not proof of a working public
request flow. Both Kazakh and Russian copy are provided.
