# Kirundi resources

A survey of what exists for Kirundi (`rn` / `run`), made on 2026-11-17. **V** means the live page
was read that day; **S** means a search snippet only; **I** means inferred. Re-check anything
before relying on it.

No commercial cloud vendor offers Kirundi speech synthesis or recognition. Many support
Kinyarwanda, which is closely related but is not Kirundi; no source was found that judges a
Kinyarwanda voice acceptable for Kirundi.

## Speech synthesis

| Resource                                        | Kirundi?          | Licence      | Notes                                                                                  |
| ----------------------------------------------- | ----------------- | ------------ | -------------------------------------------------------------------------------------- |
| Meta MMS-TTS `facebook/mms-tts-run`             | Yes               | CC-BY-NC-4.0 | Small model, runs on a CPU. Used for placeholders. V                                   |
| AfriSpeech `africa-tts`                         | Yes               | CC-BY-NC-4.0 | Self-reported as more intelligible than MMS; training audio provenance undocumented. V |
| Google, Azure, Amazon Polly, ElevenLabs, OpenAI | No                |              | V                                                                                      |
| Piper                                           | No official voice |              | A community Bible-trained voice has no licence; do not use. V                          |

## Speech recognition

| Resource                                   | Kirundi?         | Licence    | Notes                                                                    |
| ------------------------------------------ | ---------------- | ---------- | ------------------------------------------------------------------------ |
| Meta Omnilingual ASR                       | Yes (`run_Latn`) | Apache-2.0 | Sizes from CPU-feasible to GPU. No published Kirundi error rate found. V |
| Meta MMS ASR `mms-1b-all`                  | Yes              | CC-BY-NC   | V                                                                        |
| Whisper, Google, Azure, browser speech API | No               |            | V / I                                                                    |
| MMS forced aligner                         | Tagged `rn`      | CC-BY-NC   | Cannot score tone or vowel length. V / I                                 |

## Speech data

| Resource                        | Licence                                 | Notes                                                                                            |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Digital Umuganda `Afrivoice_V2` | CC-BY-4.0, gated                        | About 509 hours of transcribed Kirundi. Best candidate for measuring a recogniser. V (card only) |
| Mozilla Common Voice            |                                         | Kirundi locale registered, zero hours. V                                                         |
| FSI Kirundi Basic Course (1965) | Public domain per host                  | 35 audio files plus student text. Dated language. V                                              |
| VOA Radiyoyacu                  | Public domain for VOA-produced material | Mixes Kirundi and Kinyarwanda; agency content excluded. V                                        |

## Text

| Resource             | Licence                 | Notes                                                       |
| -------------------- | ----------------------- | ----------------------------------------------------------- |
| Tatoeba              | CC-BY 2.0 FR by default | About 5,300 Kirundi sentences. V / I                        |
| Kirundi Wikipedia    | CC-BY-SA-4.0            | About 730 articles. V                                       |
| African Storybook    | CC-BY-4.0               | Kirundi is offered; story count unknown. V                  |
| KIRNEWS              | Tagged MIT              | Scraped news, so the underlying copyright is unclear. V / I |
| OPUS English–Kirundi | Varies                  | Mostly machine-mined pairs. V                               |

## Do not use without permission

- Bible audio (Bible Society of Burundi; Bible Brain terms are restrictive) and Global Recordings
  Network.
- BBC Gahuza.
- Kinyarwanda voices presented as Kirundi.
- **matana.de** (BCU Kirundi Study App): about 7,700 headwords and 10,400 native recordings, all
  rights reserved. The best existing learner asset; worth asking permission.

## Spelling, tone and length

Tone and vowel length change meaning in Kirundi but everyday spelling marks neither. Linguists
add tone marks; some learner materials mark long vowels with a macron. Packs therefore store
standard spelling plus an optional annotated form.

## Machine translation and language models

Google Translate lists Rundi; NLLB-200 (CC-BY-NC) and MADLAD-400 (Apache-2.0) cover it. No
native-speaker evaluation of large language models on Kirundi was found. Machine-written Kirundi
must not ship without speaker review.

## Existing courses

uTalk (paid, about 2,500 phrases with native audio), the BCU Kirundi Study App (Android, free)
and the FSI course. None offers a structured four-skill course with speech feedback, spaced
review, or systematic teaching of tone and length.

## Not confirmed

Kirundi story counts on African Storybook and StoryWeaver; whether the FSI text marks tone;
whether VOA Radiyoyacu is still producing; Afrivoice access conditions and audio quality; any
error rate for Omnilingual ASR or MMS on Kirundi; the licence mix of Tatoeba's Kirundi sentences.
