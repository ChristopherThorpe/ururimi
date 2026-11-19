# Ururimi

Better than Duolingo: an immersion language-learning app that teaches you to understand, speak,
read and write a language, with real recordings from native speakers. The first language is
**Kirundi**; the framework is built so that any other language can be added as data.

_Ururimi_ is intended to mean "language" in Kirundi (to be confirmed by a speaker).

## Status

**Release 0, the walking skeleton.** One exercise works end to end: hear a word, choose the
matching picture. The five Kirundi words are placeholders: they have not yet been checked by a
native speaker and are spoken by a synthetic voice. The app says so on screen.

See [docs/plan.md](docs/plan.md) for where this is going and the
[issues](https://github.com/ChristopherThorpe/ururimi/issues) for the work in progress.

## Run it

Requires Node 22 and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open the address it prints. Add `?pack=eo-fixture` to the address to run the same app on the
tiny second language pack that proves the code is not tied to Kirundi.

## Check your work

```bash
pnpm check
```

runs formatting, lint, type checks, unit tests and content validation. The browser tests run
against the production build:

```bash
pnpm build
```

```bash
pnpm e2e
```

## Layout

| Path                       | What it is                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| `packages/content-schema`  | The format of a language pack, and its validation.                 |
| `packages/engine`          | Lesson logic. No screen or platform code, so any app can reuse it. |
| `apps/web`                 | The web app.                                                       |
| `content/packs/rn`         | The Kirundi language pack: words, pictures, audio, licences.       |
| `content/packs/eo-fixture` | A three-word test pack in a second language.                       |
| `tools`                    | Content checks, the pack build, placeholder speech generation.     |
| `docs`                     | The plan, decision records, and the survey of Kirundi resources.   |

## Language packs

A pack is a directory in `content/packs/`, one small file per item so that reviews and
recordings arrive as small changes:

```text
content/packs/<id>/
  pack.json              identity, language, support locales
  items/<item-id>.json   one word, phrase or sentence, with its glosses, audio and licences
  lessons/<lesson-id>.json
  media/                 images and audio
```

A file's name must match the id inside it. `pnpm content:check` assembles each pack and names
the file behind any problem; `pnpm build` combines each pack into the single file the web app
loads. See [docs/adr/0006-one-file-per-item.md](docs/adr/0006-one-file-per-item.md).

## Licences

Code is licensed under [Apache-2.0](LICENSE). Language content is licensed per item, as recorded
in each pack; see [docs/content-licensing.md](docs/content-licensing.md). Some placeholder audio
is **non-commercial only**.
