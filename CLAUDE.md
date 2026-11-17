# Working in this repository

Ururimi is an immersion language-learning app. Kirundi is the first language, but the code must
work for any language. Read `docs/plan.md` for the release ladder and `docs/adr/` for decisions
already made; do not reopen a decision without a new decision record.

## Commands

- `pnpm install` — install everything.
- `pnpm dev` — build the packs and start the web app.
- `pnpm check` — formatting, lint, types, unit tests, content validation. Must pass before a PR.
- `pnpm build` then `pnpm e2e -- --trace off` — browser tests against the production build.
- `pnpm format` — fix formatting.
- `pnpm content:check --commercial` — list assets that block commercial use.

## Rules that are enforced

1. **Nothing language-specific in code.** Everything about a target language lives in
   `content/packs/<id>/`. Code under `packages/` and `apps/` must not contain target-language
   words or even language names; `tools/independence.test.ts` fails if it does. Every feature
   must work on both `rn` and `eo-fixture`, and the browser tests run on every pack.
2. **The engine is pure.** `packages/engine` and `packages/content-schema` may not use the DOM,
   React, Node APIs or storage (lint enforces this). Take randomness, time and storage as
   arguments. This is what lets a phone app reuse them later.
3. **Every piece of content has provenance.** Text, images and audio each record a source and a
   licence from `packages/content-schema/src/licenses.ts`. No licence, no merge.
4. **Only a native speaker marks content reviewed.** Never set `review.status` to `reviewed`
   yourself, and never present machine-written target-language text as checked. New
   target-language text you draft goes in as `unreviewed`.
5. **Human audio beats synthetic.** Synthetic clips are placeholders, declared as
   `kind: "synthetic"` with their model's licence.

## How we work

- One GitHub issue, one branch, one pull request. Keep to the issue's scope; put anything else
  you notice in a new issue.
- An issue should fit one session: usually one package, a few hundred changed lines. If it does
  not, split it before starting.
- The main branch always runs. Every PR leaves the app working and deployable.
- Write the test with the change. Engine logic gets unit tests; anything a learner can see or
  tap gets covered by a browser test.
- Bootstrap wording (`apps/web/src/locale.ts`) must be added in English and French together.
- Record a decision that constrains future work as a short file in `docs/adr/`.

## Done means

`pnpm check` passes, `pnpm build && pnpm e2e` passes, the change works on a phone-sized screen
in light and dark mode, and the issue's acceptance criteria are each met or explicitly deferred
in the PR description.
