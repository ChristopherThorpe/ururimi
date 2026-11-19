# 5. Playback audio is mono AAC in MP4, made from kept originals

Date: 2026-11-19. Status: accepted.

## Context

Speakers record on their own phones, so recordings arrive in whatever the browser produced:
WebM/Opus from Chrome on Android, MP4/AAC from Safari on iPhone, and others. Learners play the
audio on the same range of devices. A recording must start promptly, be about as loud as the
others, and play in current Safari (iPhone and Mac), Chrome and Firefox.

## Decision

- **Originals are kept, never edited, and never shipped.** A pack only ships files that its
  `pack.json` references, so an original is simply not referenced. Where originals are stored
  (the studio's storage from Release 1) is a separate decision; the script does not care.
- **Playback files** are made by `tools/normalise-audio` (`pnpm audio:normalise <recording> <out.m4a>`):
  - **Container and codec:** AAC-LC in MP4, file extension `.m4a`, served as `audio/mp4`.
  - **Shape:** mono, 48 kHz, 64 kbit/s (about 8 KB per second of speech).
  - **Trimming:** sound quieter than -50 dB at either end is removed, keeping 0.05 s before the
    first sound and 0.15 s after the last.
  - **Loudness:** gain only, to -16 LUFS integrated (EBU R128), true peak at most -1.5 dBTP.
    Measured on the trimmed audio, then applied in a second pass (ffmpeg `loudnorm`, linear
    mode), so it is a fixed gain rather than a compressor. No noise removal, equalisation or
    any other change to how the speaker sounds.
  - **Repeatable:** settings are fixed and ffmpeg writes no timestamps or encoder tag, so the
    same input and the same ffmpeg build give byte-identical output. A different ffmpeg build
    may encode to different bytes with equivalent sound.
- **Language and tooling:** TypeScript run with the existing `tsx`, wrapping the `ffmpeg` and
  `ffprobe` programs, which must be installed (`FFMPEG` and `FFPROBE` override their names). It
  adds no dependency and is checked and tested with the rest of `tools/`.

## Why AAC in MP4

Options considered, on documented support (MDN's audio codec and container guides):

| Format          | Verdict                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAC-LC in MP4   | Chosen. Listed as supported in Chrome, Firefox and Safari. It is what iPhone recordings already are, so Safari is the browser most likely to be fussy and the one it favours. Small files.                                                                                                                |
| Opus in WebM    | Rejected as the only format. Chrome and Firefox play it. MDN says Safari played Opus only in CAF files (macOS 10.13 / iOS 11), and its tables disagree about newer Safari releases; Safari 18.4 added Opus in Ogg. Support depends on the Safari version, which a learner on an old iPhone cannot change. |
| MP3             | The other broadly supported choice, so it is the fallback. Rejected because encoders add padding at the start of the file and players differ in whether they remove it, which works against "starts promptly" for clips of a second or less; quality is also lower than AAC at the same size.             |
| WAV (PCM)       | Plays everywhere and trims exactly, but is about 12 times larger (roughly 96 KB per second of mono speech at 48 kHz, 16-bit), and audio is the bulk of the data we serve.                                                                                                                                 |
| Ogg Vorbis/Opus | Rejected: Safari support only from 18.4.                                                                                                                                                                                                                                                                  |

Mono because a phone microphone records one channel; two copies of it would double the size for
nothing. 48 kHz because Opus recordings decode at 48 kHz, which avoids resampling most Android
recordings.

The AAC encoder is ffmpeg's own (`aac`), because it is present in every ffmpeg build, including
the one on GitHub's Ubuntu runner, and is deterministic.

## What is not verified

- **Safari and iPhone playback was not tested.** The choice rests on documentation. The issue's
  check, playing a result on an iPhone and an Android phone, still has to be done by a person
  with the devices. It is the first thing to do with the first real recording.
- **Firefox does not decode AAC itself.** It uses the operating system's decoder (or a system
  library on Linux). That is present on Windows, macOS and Android; a Linux desktop without the
  system codec libraries may not play it. If that matters, add an Opus/WebM copy as a second
  source later, with a new decision record.
- Only a synthetic tone and synthetic speech were run through the script here, not a real phone
  recording. The tests use a sine tone with silence around it.
- The -50 dB silence level is absolute. A recording whose loudest sound is below it is treated as
  silent and rejected with an error; set `--silence-db` lower for such a recording, or ask the
  speaker to re-record.
- Clips with under about half a second of sound cannot be measured for loudness and are
  rejected. Single short words may hit this; revisit with real recordings.

## Consequences

Every playback file is `.m4a`, so the studio and the pack builder can rely on one extension and
one MIME type. Changing the format later means re-running the script over the kept originals,
which is why they are kept. If loudness or trimming settings change, that is also a new decision
record, since every clip must be regenerated to stay consistent.
