# Verified guest request receipt (presentation only)

A private, server-provided committed request ID/status/version can be rendered as a localized confirmation. It deliberately does not expose request capabilities, OTP, phone/email or promise a time slot. A draft or successfully verified OTP does not count as a submitted request.

Do not mount this component on the public offer page: a secure POST /guest-requests BFF, committed receipt response, private resource authorization, recovery and safe token transport must exist first. Server is authoritative for all later state changes.
