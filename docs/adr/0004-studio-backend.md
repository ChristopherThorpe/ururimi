# 4. Supabase is the studio backend

Date: 2026-11-19. Status: proposed (accepted when merged).

## Context

Release 1 needs speakers to sign in, review text and record audio on a phone. The web app has no
server ([0002](0002-stack.md)), so something hosted must hold sign-in, review records and audio.
Content trust ([0003](0003-content-trust.md)) means only a native speaker may mark an item
reviewed, so the backend must tie every decision to a named, invited person. The repository stays
the source of truth for what learners get; the backend is a workshop, not a second home for
content.

## Decision

Use **Supabase** (Auth, Postgres, Storage), called straight from the browser with row-level
security doing the authorisation. The schema is
[`supabase/migrations/20261119000000_studio_schema.sql`](../../supabase/migrations/20261119000000_studio_schema.sql),
committed and not yet applied; issue #9 applies it.

### Alternatives and cost

Prices are from each vendor's own pricing pages, read on 2026-11-19; "unverified" means I could not
confirm it there.

| Option                              | Fit                                                                                                                                                                                                                                                                                                       | Monthly cost                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Supabase** (chosen)               | Sign-in, relational tables, constraints, triggers, private file storage and row-level rules in one service. Standard Postgres, so leaving later is a `pg_dump`.                                                                                                                                           | Free: $0 (500 MB database, 1 GB files, 50,000 sign-ins; paused after a week idle; no backups). Pro: from $25 (8 GB, 100 GB). |
| Cloudflare R2 + D1 + Workers        | Cheapest. But D1 has no sign-in and no row-level rules, so we would write and secure an auth, invite, authorisation and upload-signing server ourselves. That breaks 0002.                                                                                                                                | R2 free to 10 GB, D1 free to 5 GB; paid Workers plan fee is unverified (not on the pages read).                              |
| Firebase (Auth, Firestore, Storage) | Good phone SDKs. Cloud Storage is not in the free Spark plan, so it needs the pay-as-you-go Blaze plan. Firestore is document-shaped: no foreign keys, no uniqueness, no triggers without Cloud Functions; its security rules are a separate language. Invite-only sign-in needs extra work (unverified). | Blaze is usage-priced; rate not checked, so unverified.                                                                      |

**Expected cost.** $0 while the owner builds #9 to #11. Move to Pro ($25) before the first outside
speaker is invited, because Free pauses after a week idle and has no backups. Add a transactional
email provider (see sign-in); its free tier is likely enough but unverified. Audio is small: a
few seconds per clip, so 1,000 items at about 100 KB is about 100 MB (an estimate), well inside
even the Free limit. Cloudflare would save roughly $20 a month and cost a server's worth of
design and upkeep; that is not a good trade at this size.

**Honest downsides.** A mistake in a row-level rule is a data leak, because the browser talks to
the database directly; the schema revokes everything from `anon` first and grants only named
columns, and #9 must test it with an uninvited address. Pro is a fixed $25 even if nobody records
that month. Supabase's key names are changing (see keys).

## Sign-in, limited to invited people

- Email magic link or one-time code; no passwords. Contributors use the phone's mail app.
- Public sign-up is switched off in the project's Auth settings, and the web app calls sign-in
  with `shouldCreateUser: false`. The owner invites each person with `inviteUserByEmail` using the
  secret key (or the dashboard's invite button). Both are standard Supabase features but were not
  confirmed on the docs pages read; #9 verifies them.
- Second lock: a trigger creates a `contributors` row only when the auth user was created by an
  invite (`invited_at` is set). Every row-level rule requires an active contributor who has
  accepted consent, so a stray auth user can read and write nothing. If `invited_at` proves not to
  be set at creation, #9 falls back to the owner inserting the row.
- First sign-in shows the consent form; `accept_consent(version)` stores the version and time. No
  review or recording is accepted before that, and each recording is stamped with the consent
  version in force. The consent wording is its own issue.
- The built-in email service only delivers to the project's own team and allows 2 messages an
  hour, so #9 must configure custom SMTP before any speaker is invited.

## Tables

All in `public`; see the migration for columns and constraints. `pack_id` and `item_id` are the
pack's own ids, so nothing here is language-specific.

- **contributors**: one per invited person (`id` is the auth user id). `handle` is the public
  slug used in packs (never an email); `packs` lists the pack ids they may work on; `active`;
  `consent_version`, `consented_at`. The owner sets `packs` and `active`; the contributor may
  change only `handle` and `display_name`.
- **draft_items**: the working copy of a pack item (`kind`, `text`, `annotated`, `glosses` as
  JSON by locale, `status`: `awaiting_review`, `approved`, `rejected`). Seeded by the owner from
  the pack (insert-if-missing on `(pack_id, item_id)`) with the secret key. The studio shows the
  picture and existing audio from the app's own pack files, not from here.
- **reviews**: append-only. One row per decision: `approve`, `correct` (with the new text,
  annotated form and/or glosses) or `reject` (note required). A trigger applies it to the draft
  item and sets `status`, `reviewed_by`, `reviewed_at`. This is the only way an item changes.
- **recordings**: metadata for one clip: item, contributor, `storage_path`, `mime_type`,
  `duration_ms`, `size_bytes`, `status` (`submitted`, `withdrawn`, `rejected`), `consent_version`.

Studio queue (#10) is `draft_items` where `status = 'awaiting_review'` for the pack, with a count.
A later review of an already-reviewed item is allowed and wins; the earlier reviews stay as
history.

## Audio storage

A private Storage bucket `recordings` (10 MB per file; webm, mp4, ogg, wav, mpeg). Path
`<pack_id>/<contributor_id>/<recording id>.<ext>`; the client generates the recording id first so
an interrupted upload can be retried at the same path (#11). Upload with the plain media type
(for example `audio/webm`, without a codecs suffix). Files are never public and never updated or
deleted by contributors. The device's own format is stored as given; conversion happens in the
export.

## Who may do what

- Not signed in: nothing. Signed in but not an active, consented member of the pack: nothing.
- A member reads the pack's draft items and review history, adds reviews as themselves, and can
  never edit or delete a review or an item directly. Only reviews change items, and the history
  keeps what the earlier speaker said.
- A contributor sees, adds and withdraws only their own recordings, and uploads and reads only
  files in their own folder. They cannot edit another person's recording, mark one `rejected`, or
  upload as someone else.
- The owner, with the secret key, invites, activates and deactivates people, seeds items, and may
  mark a recording `rejected`.

## From the backend into `content/packs/`

`tools/export-studio.ts` (issue #13), run by the owner on their own machine with the secret key
in an untracked environment file (`.env` is already ignored). For one pack it:

1. reads `approved` draft items and `submitted` recordings for them, and the contributors'
   handles;
2. rewrites each pack item: current text, annotated form and glosses, and
   `review: { status: "reviewed", reviewer: <handle>, date: <reviewed_at> }`, which records the
   speaker's own approval (the script does not decide anything);
3. downloads the audio, normalises it, saves it as
   `media/audio/<item id>.<handle>.<ext>`, and adds a `kind: "human"` clip with
   `speaker: <handle>` and provenance CC-BY-4.0;
4. is idempotent: fixed file names and values copied from the backend mean a second run with
   nothing new changes nothing;
5. runs `pnpm content:check`, then creates the branch `studio-export/<pack>-<date>`, commits and
   opens a pull request with `gh`. The owner reads the diff and merges.

Only the handle reaches the public repository; emails stay in the backend. Items rejected or
awaiting review are never exported. Approved work is therefore backed up in git, which matters
until Pro's daily backups (7 days) are in place.

## Keys

| Key                                                        | Where it lives                                                                                                                                       | In the web app?                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Project URL                                                | Vercel environment variable `VITE_SUPABASE_URL`                                                                                                      | Yes (public)                                                                        |
| Publishable key (`sb_publishable_...`; legacy name `anon`) | Vercel environment variable `VITE_SUPABASE_PUBLISHABLE_KEY`                                                                                          | Yes. Supabase documents it as safe to expose; row-level security is what limits it. |
| Secret key (`sb_secret_...`; legacy name `service_role`)   | The owner's password manager and a local untracked `.env` for the export and seeding scripts. Never in Vercel, never in the repository, never in CI. | **Never.** It bypasses every row-level rule.                                        |
| Database password, JWT secret, SMTP credentials            | Supabase dashboard / password manager                                                                                                                | Never.                                                                              |

The legacy `anon` and `service_role` keys are being deprecated by Supabase (stated end of 2026), so
use the new names. The app must run without these variables: learners are unaffected, and `/studio`
says it is not configured (#9). Only `apps/web` may import the Supabase client; `packages/engine`
and `packages/content-schema` stay pure.

## What each studio issue builds from this

- **#9**: create the project, set sign-up off, custom SMTP, apply the migration, add the two public
  variables to Vercel, build `/studio` sign-in and the consent screen, document inviting.
- **#10**: seed `draft_items` from the pack; list, count and write `reviews`.
- **#11**: upload to `recordings` at the stated path, then insert the `recordings` row.
- **#13**: the export script above.

## Consequences

- Each studio feature is a client call plus a policy, not a server. Changing a rule means a new
  migration file under `supabase/migrations/`.
- We depend on one vendor, bounded by standard Postgres and the export into git.
- A second language needs no schema change: add its pack id to a contributor's `packs`.
