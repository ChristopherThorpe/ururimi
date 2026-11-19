# 4. A pack stores one file per item and per lesson

Date: 2026-11-19. Status: accepted.

## Context

Reviews and recordings change one item at a time. With a whole pack in one `pack.json`, two
people working on different items edit the same file, and every change is a large diff.

## Decision

A pack directory holds:

- `pack.json`: schema version, id, language and support locales, and nothing else;
- `items/<item-id>.json`: one item each, the file name being the item's id plus `.json`;
- `lessons/<lesson-id>.json`: one lesson each, named the same way;
- `media/`: images and audio, unchanged.

`tools/packs.ts` assembles these into the same in-memory `Pack` that `packages/content-schema`
defines, and `pnpm packs:build` still writes one combined `pack.json` per pack for the web app.
Only the source layout changed; the schema and the built output did not.

- A file whose name does not match its id is an error.
- Every error names the file it came from.
- The assembled `items` and `lessons` are sorted by id (plain code-unit order), so the built output
  is the same on every machine. The order a learner meets items in comes from a lesson's
  `itemIds`, not from the sort. If lessons later need a fixed sequence, that is a schema change
  and gets its own decision.

## Consequences

Tools that read a pack's source (such as `tools/placeholder-audio/generate.py`) read
`items/*.json` rather than `pack.json`.
