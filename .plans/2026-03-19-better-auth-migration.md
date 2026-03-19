# Better Auth Migration Plan

## Goal

Migrate Pons to Better Auth as the single auth platform for:

- Pons browser/dashboard sessions
- Facebook Login for Business and Meta token access
- MCP OAuth authorization
- dynamic client registration

This replaces the current `@convex-dev/auth` app auth layer and the long-term
custom MCP API-key model.

The migration should preserve existing business data and user access to their
accounts, while moving auth/session/provider-token concerns onto Better Auth.

## Current State

### App auth

- Browser auth currently uses `@convex-dev/auth` in
  [auth.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/auth.ts).
- Convex auth routes are mounted in
  [http.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/http.ts).
- Next.js SSR and route handlers use `convexAuthNextjsToken()` in multiple
  dashboard and API files.
- Client auth uses `useAuthActions()` and `useConvexAuth()` in landing/dashboard
  flows.

### Identity and business data

- Existing business tables are keyed to current app users through fields such as:
  - `accounts.ownerId`
  - `twilioCredentials.userId`
  - `accountMembers.userId`
  - `facebookTokens.userId`
  - `apiKeys.userId`
- Current auth-coupled schema comes from `...authTables` in
  [schema.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/schema.ts).
- Convex functions depend heavily on `auth.getUserId(ctx)`.

### Facebook / Meta access

- Facebook Login for Business is configured in
  [auth.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/auth.ts)
  with custom scopes and `config_id`.
- Facebook access tokens are copied into the `facebookTokens` table and later
  used by WhatsApp/Meta flows.

### MCP auth

- MCP currently uses API keys passed as bearer tokens to
  [route.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/api/mcp/route.ts).
- API key validation and scope checks live in
  [mcp.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/mcp.ts) and
  [gateway.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/gateway.ts).
- MCP is still a stateless Streamable HTTP endpoint and does not expose OAuth
  protected-resource behavior.

## Reference Direction

Reference repo for plan shape:

- `/Users/nicolai/git/kaizenfactory/drio/.plans`

Relevant architectural guidance from prior exploration:

- Better Auth can act as an OAuth 2.1 authorization server
- Better Auth supports MCP OAuth flows and dynamic client registration
- Better Auth has a Convex integration and supports local install for generated
  schema and plugin support

Key implication for Pons:

- Better Auth should be the auth provider and OAuth server, not just a helper
- We should avoid writing a custom MCP OAuth server if Better Auth can own that
  surface
- A proper migration is still required because current business data is tied to
  legacy auth-backed user references

## Target Architecture

Use Better Auth as the only active auth system in Pons.

### Identity model

- Better Auth handles sign-in, sessions, provider accounts, and OAuth state.
- Pons business data should migrate to a canonical Better Auth-backed identity
  model.
- Domain/business tables should remain application-owned rather than being
  replaced by Better Auth storage.

### App auth model

- Next.js browser auth and server auth helpers come from Better Auth.
- Convex trusts Better Auth-backed identity rather than `@convex-dev/auth`.
- Protected app routes, dashboard SSR, and route handlers should authenticate
  through Better Auth-derived tokens/session state.

### Facebook / Meta token model

- Better Auth Facebook provider replaces the legacy Convex Auth Facebook flow.
- Meta token access should come from Better Auth provider account/token storage.
- `facebookTokens` becomes temporary migration compatibility only, then is
  removed.

### MCP model

- Better Auth OAuth Provider becomes the MCP authorization server.
- MCP protected-resource, token, consent, and dynamic client registration flows
  should come from Better Auth.
- Legacy API keys can remain temporarily during rollout, but not as the final
  model.

## Migration Principles

- Prefer Better Auth over custom auth/OAuth code.
- Keep business/domain data intact during migration.
- Avoid a flag day cutover where browser auth, Convex identity, and MCP all
  switch at once.
- Migrate app auth first, then Facebook token access, then MCP OAuth.
- Keep compatibility layers temporary and remove them after verification.
- Treat email collisions and identity mismatches as migration blockers, not
  silent merges.

## Phase 0: Design and validation

1. Confirm Better Auth product choices:
   - local Convex install
   - Facebook Login for Business
   - OAuth Provider plugin for MCP
2. Confirm the canonical identity model for business tables:
   - Better Auth user ID directly, or
   - app `users` row linked 1:1 to Better Auth user identity
3. Confirm the exact Better Auth provider token access pattern needed for Meta
   Graph API calls.
4. Confirm whether MCP API keys stay for one transition window or are removed as
   soon as OAuth launches.
5. Audit existing users for migration safety:
   - normalized email coverage
   - duplicate emails
   - orphaned business records

Deliverable:

- approved identity model, migration rules, and rollout boundary between app
  auth and MCP OAuth

## Phase 1: Better Auth foundation

1. Add Better Auth and Convex integration packages.
2. Create a local Better Auth install under `convex/betterAuth/`.
3. Add:
   - Better Auth auth instance
   - generated Better Auth schema
   - adapter exports
   - Convex component registration
4. Add Next.js auth route proxy:
   - `src/app/api/auth/[...all]/route.ts`
5. Add dedicated auth helpers:
   - `src/lib/auth-client.ts`
   - `src/lib/auth-server.ts`
6. Configure Facebook provider with the same required scopes and `config_id`
   semantics as the current auth flow.
7. Configure Better Auth OAuth Provider so MCP migration can build on the same
   foundation later.

Deliverable:

- Better Auth can sign users in locally in parallel with the existing auth
  system

## Phase 2: Identity migration scaffolding

1. Define the canonical app identity model.
2. Remove the assumption that legacy Convex Auth tables are the long-term auth
   source of truth.
3. Add migration helpers that can resolve current user identity under both:
   - legacy auth
   - Better Auth
4. Add migration support for linking old user references to Better Auth-backed
   identity.
5. Add verification queries/actions for:
   - missing user mappings
   - duplicate emails
   - orphaned account ownership
   - orphaned memberships

Deliverable:

- migration-safe identity scaffolding without changing end-user behavior yet

## Phase 3: Data migration

1. Create or link Better Auth users for existing users.
2. Match users by normalized email.
3. Backfill user-linked business records:
   - `accounts.ownerId`
   - `twilioCredentials.userId`
   - `accountMembers.userId`
   - `facebookTokens.userId`
   - `apiKeys.userId`
4. Add verification reporting before switching write paths.
5. Switch writes to the new identity model after backfill succeeds.
6. Keep temporary dual-read behavior only until verification is complete.

Deliverable:

- existing users retain access to the same Pons data under the Better Auth-backed
  identity model

## Phase 4: App auth cutover

1. Replace auth provider wiring in:
   - [layout.tsx](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/layout.tsx)
   - [ConvexClientProvider.tsx](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/ConvexClientProvider.tsx)
2. Replace client auth flows in:
   - [page.tsx](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/page.tsx)
   - [reauth/page.tsx](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/reauth/page.tsx)
   - [layout-client.tsx](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/src/app/dashboard/[accountId]/layout-client.tsx)
3. Replace SSR token retrieval in dashboard pages and route handlers.
4. Replace direct `auth.getUserId(ctx)` assumptions in Convex functions with a
   Better Auth-backed user resolver.
5. Remove legacy auth routing from
   [http.ts](/Users/nicolai/.t3/worktrees/pons/t3code-74b1644c/convex/http.ts)
   once Better Auth auth flow is verified.

Deliverable:

- browser auth, SSR auth, and Convex request auth run on Better Auth

## Phase 5: Facebook token cutover

1. Implement a single helper for retrieving Facebook provider tokens from Better
   Auth.
2. Replace token access in:
   - WhatsApp discovery
   - account setup
   - phone registration
   - send/media/template flows
   - token-expiry/reauth logic
3. Keep `facebookTokens` only as temporary fallback during rollout.
4. Remove `facebookTokens` after production verification.

Deliverable:

- Meta-dependent flows work without relying on legacy Convex Auth token storage

## Phase 6: MCP OAuth migration

1. Enable Better Auth OAuth Provider for MCP authorization flows.
2. Convert `/api/mcp` from API-key-only auth to OAuth protected-resource
   behavior.
3. Update MCP route/server/gateway code to:
   - validate bearer tokens
   - enforce scopes
   - return compliant bearer challenges
   - support dynamic client registration
4. Keep API-key compatibility temporarily if needed.
5. Remove API-key-first MCP docs and flows after OAuth verification.

Deliverable:

- MCP auth runs on Better Auth OAuth with dynamic client registration

## Phase 7: Cleanup

1. Remove `@convex-dev/auth` dependencies and code paths.
2. Remove obsolete auth helpers and providers.
3. Remove temporary migration compatibility paths.
4. Remove legacy auth tables and token storage only after verification.
5. Update docs and add smoke/regression coverage.

Deliverable:

- Better Auth is the only active auth system in Pons

## Important Migration Notes

- Do not try to force Better Auth to reuse legacy Convex Auth tables directly.
- Preserve business data first; simplify storage second.
- Do not migrate MCP auth before app auth and Meta token access are stable.
- Do not silently merge users with duplicate emails.
- Keep API keys only as transitional compatibility if necessary.

## Verification Checklist

- Existing user can sign in through Better Auth and still access the same Pons
  accounts.
- Dashboard SSR and protected routes work.
- Sign-out and reauth flows work.
- WhatsApp discovery and send flows still work.
- Meta token-dependent actions work via Better Auth provider token access.
- MCP metadata and OAuth flows work.
- Dynamic client registration works.
- Invalid MCP bearer tokens return compliant challenge responses.
- Legacy Convex Auth is no longer required for any active path.
