# Plan

Ururimi teaches a learner to understand, speak, read and write a language by immersion. Kirundi
is first. This page is the map; the detail lives in GitHub issues, grouped by release milestone.

## Decisions

| Question   | Decision                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Learners   | English and French speakers at launch; the bootstrap language is a setting.                            |
| Audio      | Recorded by native speakers through a built-in studio. Synthetic voices only as declared placeholders. |
| Curriculum | Our own graded sequence, with the 1965 FSI course audio and open stories as extras.                    |
| Platform   | Web app first; the lesson engine is kept free of screen code for later reuse.                          |
| Licensing  | Non-commercial for now, decide later. Code Apache-2.0, own content CC-BY-4.0.                          |
| Budget     | Modest monthly spend is acceptable.                                                                    |
| Hosting    | Vercel for the web app; Supabase for sign-in, data and audio from Release 1.                           |

## How immersion works

The app should be in the target language almost at once. To make that possible, the first unit
teaches the words the app itself uses (listen, repeat, choose, write…), each with a gloss in
English or French. A gloss disappears once the learner has shown they know the word, so the
interface becomes target-language-only without the learner being lost.

## Release ladder

Each release is a working, deployed app that does more than the last.

| Release               | What works at the end                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| 0. Walking skeleton   | Deployed app: hear a word, pick the matching picture. Checks and previews run. |
| 1. Contributor studio | Speakers sign in, record each sentence on a phone, approve or correct text.    |
| 2. Unit 0             | Instruction words taught in English and French, with fading glosses.           |
| 3. Four skills        | Listening, reading, dictation and record-and-compare speaking; spaced review.  |
| 4. Speech checking    | A recogniser, measured on real Kirundi, gives transcript-match feedback.       |
| 5. Accounts           | Learner sign-in and progress synced across devices.                            |
| 6. Authentic extras   | FSI audio and open stories as graded listening and reading.                    |
| 7. Second language    | A real second pack, and a native shell if wanted.                              |

## Speech

- **Output.** Human recordings first. The only Kirundi synthetic voices are non-commercial, so
  they are used as labelled placeholders and tracked in
  [content-licensing.md](content-licensing.md).
- **Input.** Speaking practice begins as record-and-compare against the native recording. No
  vendor offers Kirundi recognition; the candidate is Meta's Omnilingual ASR (Apache-2.0),
  self-hosted. It is adopted only after being measured on real Kirundi speech, and it cannot
  judge tone or vowel length.

## Working method

- One issue, one branch, one pull request, sized for a single working session.
- Milestones are releases. The main branch is always deployable.
- Checks run on every pull request; see [CLAUDE.md](../CLAUDE.md) for the rules.
- Decisions that constrain later work are recorded in [adr/](adr/).
