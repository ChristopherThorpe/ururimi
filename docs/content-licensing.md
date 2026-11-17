# Content licensing

Code is Apache-2.0. Content is different: every word, picture and recording in a language pack
records where it came from and its licence, and `pnpm content:check` refuses a pack where any is
missing.

## Our own content

Text, pictures and recordings made for this project are released under **CC-BY-4.0**, unless a
contributor's agreement says otherwise. Speakers who record or review must agree to a recording
release before their work is published (the form is tracked as an issue).

## The project is non-commercial for now

The owner's decision (2026-11-17) is: non-commercial now, decide later. Non-commercial material
may therefore be used, provided it is declared, so it can be found and removed.

```bash
pnpm content:check --commercial
```

lists every asset that would block commercial use. Today that is the placeholder audio:

| Asset                        | Source                               | Licence      |
| ---------------------------- | ------------------------------------ | ------------ |
| `content/packs/rn` TTS clips | Meta MMS-TTS, `facebook/mms-tts-run` | CC-BY-NC-4.0 |

## What may be added

| Licence                        | Allowed | Notes                                             |
| ------------------------------ | ------- | ------------------------------------------------- |
| Public domain, CC0             | Yes     |                                                   |
| CC-BY, CC-BY-SA                | Yes     | Record the attribution in the item's provenance.  |
| CC-BY-NC                       | For now | Counts against commercial use; avoid if possible. |
| "All rights reserved", unclear | No      | Ask the rights holder first.                      |

Sources judged unusable without permission are listed in
[kirundi-resources.md](kirundi-resources.md).
