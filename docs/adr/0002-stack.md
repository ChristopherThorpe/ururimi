# 2. TypeScript workspace, static web app, Vercel

Date: 2026-11-17. Status: accepted.

## Context

The owner wants a web app first with a native app possible later, a system that runs at every
step, and modest running costs.

## Decision

- One pnpm workspace in TypeScript. `packages/engine` and `packages/content-schema` are pure
  (no DOM, React or Node APIs) so a later React Native app can import them unchanged.
- `apps/web` is a Vite + React single-page app, served as static files. A server framework was
  not chosen because nothing yet needs a server; sign-in, database and audio storage will come
  from a hosted backend (Supabase, to be confirmed by its own decision record in Release 1) and
  speech recognition from a separate service.
- Hosting on Vercel, which builds a preview for every pull request.
- Vitest for unit tests, Playwright for browser tests on a phone-sized screen, GitHub Actions
  for checks on every pull request.
- TypeScript is held at version 6 because typescript-eslint does not yet support version 7.

## Consequences

The app has no server of its own, so anything secret or heavy must live in a backend service.
