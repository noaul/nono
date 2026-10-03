# Server mobile notification infrastructure

Status: 2026-10-03. Infrastructure only; the shipped application does not have system push.

The device API binds encrypted vendor registration data to an existing browser session. Logout,
password-change session revocation, natural expiry and account deletion remove delivery eligibility.
The sessionless revoke endpoint accepts a separate hashed, limited credential and reveals no device
existence. Full PostgreSQL restore disables restored bindings, cancels pending/sending attempts and
expires restored events. Registering again cannot reactivate that old queue. Per-module JSON backups
do not export or import mobile devices, sessions or push events.

The outbox stores one event per `(userId, source, eventId)` and one attempt per `(eventRowId, deviceId)`.
PostgreSQL workers claim rows with `FOR UPDATE SKIP LOCKED`, use 60-second leases and a 10-second
provider-call timeout, and reject outcomes from replaced or expired leases. Temporary failures use
30-second, 2-minute, 10-minute, 30-minute and 2-hour delays, bounded by event expiry and retry count.
Critical events expire within one hour of occurrence; other events within 24 hours. Cancellation also
expires the event, so a later device registration cannot recreate a resolved event's pending work.

No provider is wired into production. There is no automatic mobile worker or event-discovery/relay
activation, and no Xiaomi HTTP implementation or SDK. Bark, Telegram and other existing channel
behavior is unchanged. A future provider must enforce its own cancellable network timeout, use the
remaining event TTL, implement documented vendor error mapping, and preserve the envelope's stable
dedupe key. Vendor acceptance is not proof of device receipt. Acceptance followed by a crash or a
request timeout can still result in duplicate vendor submissions or an in-flight message after logout;
all vendor payloads contain only a generic NoNo reminder and an event identifier/relative path.

Available browser-session endpoints (all writes retain the application's origin checks):

- `GET /api/mobile/notifications/:eventId`: owned, unexpired event summary and internal target.
- `POST /api/mobile/notifications/:eventId/opened` with `{deviceId}`: first open for an eligible owned
  device with a matching attempt; never changes accepted/delivery state.
- `GET /api/mobile/deliveries?limit=50`: independent attempt states/counts; `enabled` is false in
  production, `receivedAt` remains null without a verified provider receipt.
- `GET /.well-known/assetlinks.json`: public JSON, empty unless
  `ANDROID_RELEASE_SHA256_FINGERPRINTS` explicitly contains comma-separated release SHA-256
  certificate fingerprints. Package is `com.noaul.nono`; no debug certificate is inferred.

No device-binding or notification-opening UI is required for the current non-push Android release.
Continue using the existing notification center. Feed/relay integration, stable IDs from NoMoney/Yumi,
a supported provider, deployment configuration and physical-device/App Links checks remain deferred.

Verification uses the server test suite and `tests/integration/postgres.mts` against an explicitly named
loopback `nono_integration_*` database. The integration suite resets that disposable database; it tests
concurrent enqueue, concurrent workers, lease recovery/stale outcomes, restore cancellation and the
session foreign keys. No Xiaomi service or physical device was used.
