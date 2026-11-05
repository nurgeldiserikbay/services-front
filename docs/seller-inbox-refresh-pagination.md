# Seller inbox — refresh and cursor reconciliation

Three incremental frontend stages, built on the previous filter UI.

1. **Cursor page reconciliation:** `mergeSellerInboxPages(previous, incoming, sellerKind)` deduplicates by request ID, prefers strictly newer row versions, excludes other seller kinds, and sorts deterministically. `canAdvanceSellerCursor` rejects repeated cursors, preventing accidental loops. These helpers process authenticated server data only. An account/workspace switch MUST clear the previous pages, cursors, in-flight requests and cache; seller kind alone does not identify a seller.
2. **Protected refresh boundary:** The existing `SellerRequestList` accepts an optional `onRefresh` supplied exclusively by the authenticated seller workspace. After accepted/declined decision success or server conflict, the component locks the stale version, calls `onRefresh` and retains the lock until fresher props arrive. Refresh failures are exposed, never silently treated as success. User refreshes cannot overlap.
3. **UI quality and regression tests:** localized kk/ru refresh controls, busy/disabled behavior, and source-level tests.

This is NOT live seller integration: no seller auth/session, CSRF/Origin-protected BFF endpoints, server pagination loader, production ACL or E2E have been implemented here. Before mounting, implement those secure layers, reset pagination on seller/account changes and verify exact API schema and authorization against services-back and canonical services docs. These tests are regression guards, not backend or browser E2E tests.
