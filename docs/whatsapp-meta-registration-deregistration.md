# WhatsApp Cloud Registration and Deregistration (Meta <-> Pons)

This document is the internal runbook for the WhatsApp onboarding lifecycle in Pons.

It covers:
- What we do during attach (registration) and detach (deregistration)
- Which Meta Graph API endpoints are called
- Which OAuth scopes and env vars must be present
- How to debug "test webhook works, real inbound does not" cases

This is repository docs (not Fumadocs content).

## Architecture Overview

Pons has two webhook subscription layers:

1. App-level webhook configuration (once per Meta app)
   - Endpoint: `POST /{app-id}/subscriptions`
   - Sets callback URL, verify token, and fields.

2. WABA-level app subscription (per WABA)
   - Endpoint: `POST /{waba-id}/subscribed_apps`
   - Binds a specific WABA to the app's webhook config.

Both layers must be valid for production inbound events.

## Source of Truth in Code

- Facebook OAuth scopes and token storage:
  - `convex/auth.ts`
- Meta API helper:
  - `convex/metaFetch.ts`
- Discovery/subscription actions:
  - `convex/whatsappDiscovery.ts`
- Attach/reattach UI flow:
  - `src/components/SetupAccount.tsx`
- Detach flow:
  - `src/components/AccountSettings.tsx`
  - `convex/accounts.ts`
- Webhook endpoint and parsing:
  - `src/app/api/webhook/route.ts`
- Webhook signature verification + ingest gateway:
  - `convex/gateway.ts`
  - `convex/mcpNode.ts`

## Required OAuth Scopes

Configured in `convex/auth.ts`:

- `email`
- `public_profile`
- `business_management`
- `whatsapp_business_management`
- `whatsapp_business_messaging`

Important: if reconnecting to a different business portfolio, the user must complete a fresh auth flow so Meta grants are updated for that business context.

## Required Environment Variables

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `WEBHOOK_VERIFY_TOKEN`
- `WEBHOOK_CALLBACK_URL`
- `NEXT_PUBLIC_CONVEX_URL` (for webhook route -> Convex client)

Missing any of these can break registration or verification.

## Registration (Attach/Reattach) Flow

### A. Discovery

Used to present selectable businesses, WABAs, and numbers:

- `GET /me/businesses?fields=id,name`
- `GET /{business-id}/owned_whatsapp_business_accounts?fields=id,name,message_template_namespace`
- `GET /{waba-id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier,platform_type,is_official_business_account`

### B. Register app webhook (app-level)

Called by `registerAppWebhook`:

- `POST /{app-id}/subscriptions`
- Auth token: App Access Token (`{app_id}|{app_secret}`)
- Request body:
  - `object: "whatsapp_business_account"`
  - `callback_url: WEBHOOK_CALLBACK_URL`
  - `verify_token: WEBHOOK_VERIFY_TOKEN`
  - `fields: "messages"`

Notes:
- This endpoint is idempotent in our usage.
- Meta expects `access_token` in body for this call in our helper setup.

### C. Subscribe WABA to app (WABA-level)

Called by `subscribeWaba`:

- `POST /{waba-id}/subscribed_apps`
- Auth token: user OAuth token from `facebookTokens`

### D. Attach local account state

- Existing number path: `attachExistingConnection`
- BYON path: `prepareReattachByon` then add/verify/register phone

### E. Registration nuance

Meta `status=CONNECTED` only means the number is on the WABA.
Cloud API registration readiness is checked via:

- `platform_type === "CLOUD_API"`

If not CLOUD_API, Pons runs phone registration flow with two-step PIN.

## Deregistration (Detach) Flow

As of current implementation:

1. UI first calls `unsubscribeWaba`:
   - `DELETE /{waba-id}/subscribed_apps`
   - body includes `app_id` + `access_token`

2. Then local detach mutation clears account Cloud linkage fields:
   - status -> `detached`
   - clears `phoneNumberId`, verification state, failure state

Current behavior is resilient:
- If Meta unsubscribe fails, user still can detach locally.
- Failure is surfaced in UI toast and logged.

## Webhook Receipt and Verification Path

### GET verification

`src/app/api/webhook/route.ts` handles:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Compares token against `WEBHOOK_VERIFY_TOKEN` with timing-safe equality.

### POST inbound/status

1. Require `x-hub-signature-256`
2. Parse payload and ensure `object === "whatsapp_business_account"`
3. Forward to Convex gateway actions

Signature verification is done in Convex (`verifyWebhookSignature`) using `FACEBOOK_APP_SECRET` with HMAC-SHA256 against raw body.

## Operational Checks (Copy/Paste)

Use these checks when onboarding or debugging.

### 1) Confirm app-level webhook config

`GET /{app-id}/subscriptions` (using app access token)

Expect:
- object `whatsapp_business_account`
- callback URL matches `WEBHOOK_CALLBACK_URL`
- `messages` in fields

### 2) Confirm WABA-level app subscription

`GET /{waba-id}/subscribed_apps`

Expect:
- current `FACEBOOK_APP_ID` is present

### 3) Confirm phone belongs to expected WABA and is cloud-ready

`GET /{waba-id}/phone_numbers?...`

Expect:
- expected `phone_number_id`
- `status` and `platform_type` are sane (`CLOUD_API` for fully attached cloud numbers)

### 4) Confirm OAuth grant quality

`GET /debug_token` for the stored user token

Expect:
- `is_valid: true`
- scopes include `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`
- granular targets include the current business/WABA context

### 5) Verify Pons ingestion visibility

Convex tables to inspect:
- `webhookLogs` (raw webhook records)
- `webhookEvents` (normalized events)
- `webhookDeliveries` (forward deliveries to customer endpoints)

## Known Failure Pattern: Test Webhook Works, Real Inbound Does Not

If Meta "Send test webhook" arrives but production inbound user messages do not:

Likely causes:
- stale or incomplete OAuth grant scope for newly connected business
- WABA/number moved portfolios and user token not re-issued with correct granular access
- number recreated/migrated so old `phone_number_id` is still referenced operationally

What to do:
1. Re-run full Embedded Signup / connect flow (not only app session login)
2. Verify token freshness (`issued_at`) and `debug_token` scopes/targets
3. Re-apply WABA subscription (`POST /{waba-id}/subscribed_apps`)
4. If still inconsistent, do hard reset:
   - `DELETE /{waba-id}/subscribed_apps` with `app_id`
   - then `POST /{waba-id}/subscribed_apps`
5. Send a real inbound WhatsApp message and confirm new `webhookLogs` row for current `phone_number_id`

## Productization Notes (Tech Provider)

- Being a verified tech provider removes the strict same-portfolio requirement.
- It does not remove the need for:
  - explicit app webhook registration
  - explicit WABA app subscription
  - correct OAuth grants for the customer's business assets

In other words: cross-portfolio works, but only with correct permissions and subscription state.

## Future Hardening Suggestions

1. Add an admin action to perform a one-click hard refresh:
   - re-register app webhook
   - unsubscribe + subscribe WABA
2. Persist last known subscription audit snapshot per account:
   - app id, waba id, phone number id, callback URL, check timestamp
3. Add an automated post-attach smoke check:
   - verify `subscribed_apps`
   - verify phone list includes selected number
4. Add token diagnostics UI:
   - token issued time, expiry, and scope health checks
