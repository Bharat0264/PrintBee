# PrintBee active-order experience

## Implemented

- Persistent customer floating card with collapsed/expanded states, session-only display preference, multiple-order previous/next controls, complete-details action, and no widget when there are no active paid orders.
- Existing authenticated `/api/orders/my` is the only order data source. Existing ownership checks, prices, payments, rider assignment, OTP generation/verification, storage, and database schema are unchanged.
- Friendly mappings for CONFIRMED, PRINTING, READY_FOR_PICKUP, RIDER_ASSIGNED, DELIVERED and CANCELLED; separate existing plagiarism-report stages. No invented out-for-delivery status or ETA.
- Available rider name and validated phone contact link. OTP appears only for paid, rider-assigned print orders when the server supplies a code; hidden before assignment, after delivery/cancellation, and for report-only orders. Removed the older early-OTP homepage/payment-success displays.
- In-memory order data, account-keyed widget lifecycle, aborted stale requests, logout/authorization clearing, and no OTP in browser storage, URLs or status-toast text.
- One 25-second refresh loop while active orders exist. Visibility-aware pause, focus/manual refresh, timeout, retry message, and cleanup. Recurring refresh stops after all orders complete. No new notification sound.
- Status-change toast, animated timeline, paper/printer/package/rider journey, and one short delivery celebration on an observed transition, not initial history load.
- Upload-selection feedback, responsive paper stack, grayscale/colour and duplex transforms, copy-dependent stack depth, explicit successful cart-add flight/pulse, edit/removal feedback, animated price emphasis, checkout feedback, backend-verified payment feedback and existing payment retry controls.
- Optional lazy-loaded mini studio with four explanatory workflow steps. No WebGL, continuous render loop, new package, external 3D assets or gyroscope permissions.
- Order history uses the shared timeline, document disclosures and gated OTP component. Profile includes active-order links.
- Shared motion durations/easing, reduced-motion fallback, visible keyboard focus, dialog Escape handling, responsive touch controls, modal suppression, and safe-area-aware positioning.
- Fixed small-file size formatting and added scroll clearance for the bottom navigation/floating card. Expanded tracking is a dismissible panel; other dialogs take priority.

## Files

New: `app/components/ActiveOrderWidget.tsx`, `useCustomerOrders.ts`, `order-model.ts`, `CustomerMotion.tsx`, `PrintStudio.tsx`, `app/order-motion.css`, `tests/active-order-model.test.mjs`.

Integrated into: `app/PrintBeeApp.tsx`, `app/components/PrintBeeExperience.tsx`, `app/layout.tsx`. Updated the scanner source-contract test to assert the retained protected scanner UI rather than removed wording.

Dependencies added: none.

## Validation

- Production build passed; built Cloudflare Worker rendered the full homepage successfully in its actual local runtime, with no captured browser runtime errors.
- Seven new executable model tests passed: active filtering, multi-order sorting, OTP gates, actual status mappings, report stages, phone validation and small-file sizes.
- Existing plus new suite: 47 tests, 43 passed, four pre-existing failures (old delivery wording and WEBP exclusions).
- New/shared components lint: zero errors, two image-element warnings. Full application lint/type checks still report existing monolithic-app/backend issues; no new component type errors were reported.
- Local synthetic browser harness verified assigned-rider/OTP layout, multi-order navigation, Escape minimization, account change removing the widget, optional studio loading/closing, and reduced-motion disabling animation/transforms.
- Expanded widget checked at 320, 360, 375, 390, 430, 768, 1024 and 1440 pixels: document width matched viewport; mobile widget bottom stayed above the bottom navigation.
- Local hook harness verified delayed old-account response suppression, logout clearing, visible failed-refresh recovery, retry success and no recurring refresh after completion.
- QA fixtures are local-only under `tmp/`; verified they are absent from the production build.

## Limitations

- No live payment, customer order, rider assignment, OTP verification, payout or production-storage mutation was created for testing. The user has no designated test account/payment sandbox. These backend transitions are integrated but not claimed as live end-to-end verified.
- The API does not supply an update timestamp, ETA, rider photo, vehicle details or distinct pickup/out-for-delivery events. Sorting falls back to creation time; unavailable information is omitted.
- The widget persists through this app's customer sections/modals. Full navigation to separate policy routes does not mount the customer ordering app; returning home restores the display preference and refetches authorized orders.
- Order-file deletion is irreversible in the current backend, so no misleading Undo or file-based reorder was added.
