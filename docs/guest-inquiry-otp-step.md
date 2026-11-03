# Guest OTP presentation — Step 2

This change adds the second **unmounted presentation component** for the Services guest inquiry. Its only job is to collect six digits, prevent duplicate concurrent clicks, call an injected async `onVerify` callback and render localized results (invalid, expired, unavailable, verified). It clears entered codes after verification and does not put OTP or tokens in a URL, log or persistent browser storage.

No client code creates a guest request or assumes an OTP message was actually delivered. The parent must supply a reviewed browser BFF with HttpOnly/Secure proof handling, CSRF/Origin verification, provider budgets and server-side idempotency, followed by a distinct POST /guest-requests action and receipt page. Until that is operational, do **not** mount `GuestOtpStep` or `GuestInquiryDraft` on the published offer page.
