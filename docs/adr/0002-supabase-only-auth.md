# 2. Supabase as the sole auth strategy

Date: 2026-07-15

## Status

Accepted

## Context

The template shipped five authentication strategies at once — custom, Auth0,
Cognito, Firebase, and Supabase — behind an `AuthStrategy` switch. That pulled
`aws-amplify`, `firebase`, and `@auth0/nextjs-auth0` into every install and
meant five parallel sign-in/sign-up/reset flows to keep working, even though any
real project uses one. The documented "Baseplate" stack already standardizes on
Supabase for auth, database, and storage.

## Decision

Wire **Supabase only**. Delete the Auth0, Cognito, Firebase, and custom flows and
their SDKs. Keep the `AuthStrategy` abstraction (a single-entry enum) so a second
provider can be added later without rewriting callers, but ship one strategy.

## Consequences

- Much smaller dependency tree and one auth surface to maintain.
- Supabase becomes a hard dependency for auth; the app needs a Supabase project
  (local via the Supabase CLI, or hosted) to run signed-in flows.
- App _data_ remains mock by default (see ADR 0003); only auth is really wired.
- Adding another provider later is a deliberate, contained task rather than
  something the template carries speculatively.
