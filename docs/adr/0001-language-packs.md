# 1. A language is a data pack, never code

Date: 2026-11-17. Status: accepted.

## Context

Kirundi is the first language, but the framework must serve others. Language-specific
assumptions creep into code easily: a hard-coded word, a default locale, a spelling rule.

## Decision

Everything specific to a target language lives in `content/packs/<id>/`, in the format defined
by `packages/content-schema`. The app loads a pack at run time and knows nothing else about the
language. This will include the app's own instruction words once immersion is built.

Two checks hold the line:

- a second, tiny pack in another language (`eo-fixture`) runs through every browser test;
- `tools/independence.test.ts` fails if any pack word or language name appears in code.

The languages a learner already knows (English and French at launch) are a separate idea: the
pack lists them as `supportLocales`, and the app's bootstrap wording lives in `apps/web`.

## Consequences

Adding a language should need no code change. When it does, that is a bug in the framework,
fixed in the framework rather than special-cased.
