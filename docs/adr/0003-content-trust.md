# 3. Content carries provenance and review status

Date: 2026-11-17. Status: accepted.

## Context

Kirundi is a low-resource language. No native-speaker evaluation of language models on Kirundi
was found, so machine-written Kirundi cannot be trusted. No Kirundi synthetic voice is licensed
for commercial use. Standard Kirundi spelling omits tone and vowel length, both of which change
meaning.

## Decision

- Every text, image and audio clip records its source and licence.
- Every item has a review status. Only a native speaker may mark an item reviewed, and learners
  should only be shown reviewed items. Until the contributor studio exists (Release 1), the app
  shows unreviewed items behind `INCLUDE_UNREVIEWED` with an on-screen notice.
- Audio is human-recorded wherever possible. A synthetic clip is a declared placeholder, and the
  engine always prefers a human clip.
- Items store standard spelling in `text`, with an optional `annotated` form for tone and length.

## Consequences

Content cannot be bulk-generated and shipped. The speed of the course is set by speaker review
and recording, which is why the contributor studio is the second release.
