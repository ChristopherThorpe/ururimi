-- Contributor studio: first schema. See docs/adr/0004-studio-backend.md.
--
-- Committed, not applied. Issue #9 applies it to the backend project.
-- Nothing here names a language: a pack is just a text id (`pack_id`).
--
-- Access model in one paragraph: the web app uses the publishable key, so every
-- request runs as `anon` (not signed in) or `authenticated` (signed in). `anon`
-- gets no privileges at all. `authenticated` may only act through the policies
-- below, and only if `studio_member(pack)` says the person is an active,
-- consented contributor for that pack. The secret key bypasses all of this and
-- is used only from the owner's machine (invites, seeding, export).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.item_status as enum ('awaiting_review', 'approved', 'rejected');
create type public.review_decision as enum ('approve', 'correct', 'reject');
create type public.recording_status as enum ('submitted', 'withdrawn', 'rejected');

-- ---------------------------------------------------------------------------
-- contributors: one row per invited person, keyed by their sign-in identity
-- ---------------------------------------------------------------------------

create table public.contributors (
  id              uuid primary key references auth.users (id) on delete cascade,
  -- Public name used in the pack (`review.reviewer`, `speaker`). Never an email.
  handle          text not null unique
                  default ('speaker-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
                  check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name    text,
  -- Pack ids this person may work on. Set by the owner, not by the contributor.
  packs           text[] not null default '{}',
  -- Switched off by the owner to remove access without deleting their work.
  active          boolean not null default true,
  -- Consent to release recordings and corrections under CC-BY-4.0.
  consent_version text,
  consented_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- A contributor row exists only for people the owner invited. `invited_at` is
-- set by the invite call and cannot be supplied by someone signing up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invited_at is not null then
    insert into public.contributors (id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the caller an active, consented contributor for this pack?
create function public.studio_member(pack text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.contributors c
    where c.id = auth.uid()
      and c.active
      and c.consented_at is not null
      and pack = any (c.packs)
  );
$$;

-- Record consent. Callable only by the signed-in contributor, for themselves.
create function public.accept_consent(version text) returns void
language sql security definer set search_path = public as $$
  update public.contributors
     set consent_version = version, consented_at = now()
   where id = auth.uid() and active;
$$;

-- ---------------------------------------------------------------------------
-- draft_items: the working copy of a pack item that speakers review
-- ---------------------------------------------------------------------------

create table public.draft_items (
  id          uuid primary key default gen_random_uuid(),
  pack_id     text not null,
  item_id     text not null,                        -- the pack's own item id
  kind        text not null check (kind in ('word', 'phrase', 'sentence')),
  text        text not null check (length(text) > 0),
  annotated   text,                                 -- tone / vowel length, optional
  glosses     jsonb not null default '{}'::jsonb,   -- { "<locale>": "<meaning>" }
  image_path  text,                                 -- pack-relative; shown from the app bundle
  status      public.item_status not null default 'awaiting_review',
  reviewed_by uuid references public.contributors (id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pack_id, item_id)
);

create index draft_items_queue on public.draft_items (pack_id, status);

-- ---------------------------------------------------------------------------
-- reviews: append-only record of every decision. Never updated or deleted.
-- ---------------------------------------------------------------------------

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  draft_item_id uuid not null references public.draft_items (id) on delete cascade,
  reviewer      uuid not null default auth.uid() references public.contributors (id),
  decision      public.review_decision not null,
  -- Filled only for 'correct': the values the speaker wants the item to have.
  text          text,
  annotated     text,
  glosses       jsonb,
  note          text,
  created_at    timestamptz not null default now(),
  check (decision <> 'reject' or length(coalesce(note, '')) > 0),
  check (decision <> 'correct' or text is not null or annotated is not null or glosses is not null)
);

create index reviews_by_item on public.reviews (draft_item_id, created_at);

-- A review is the only way an item changes. Applying it here (not in the app)
-- means no contributor can edit an item directly.
create function public.apply_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decision = 'correct' then
    update public.draft_items
       set text      = coalesce(new.text, text),
           annotated = coalesce(new.annotated, annotated),
           glosses   = glosses || coalesce(new.glosses, '{}'::jsonb)
     where id = new.draft_item_id;
  end if;
  update public.draft_items
     set status      = case when new.decision = 'reject' then 'rejected'::public.item_status
                            else 'approved'::public.item_status end,
         reviewed_by = new.reviewer,
         reviewed_at = new.created_at,
         updated_at  = now()
   where id = new.draft_item_id;
  return new;
end $$;

create trigger review_applied
  after insert on public.reviews
  for each row execute function public.apply_review();

-- ---------------------------------------------------------------------------
-- recordings: metadata for an audio file held in Storage bucket `recordings`
-- ---------------------------------------------------------------------------

create table public.recordings (
  id              uuid primary key default gen_random_uuid(),
  draft_item_id   uuid not null references public.draft_items (id) on delete cascade,
  contributor_id  uuid not null default auth.uid() references public.contributors (id),
  -- Object path in the bucket: <pack_id>/<contributor_id>/<recording id>.<ext>
  storage_path    text not null unique,
  mime_type       text not null,
  duration_ms     integer check (duration_ms > 0),
  size_bytes      integer check (size_bytes > 0),
  status          public.recording_status not null default 'submitted',
  -- Which consent covered this recording; filled by trigger, not the client.
  consent_version text,
  created_at      timestamptz not null default now()
);

create index recordings_by_item on public.recordings (draft_item_id, status);

create function public.stamp_recording() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select c.consent_version into new.consent_version
    from public.contributors c where c.id = new.contributor_id;
  return new;
end $$;

create trigger recording_stamped
  before insert on public.recordings
  for each row execute function public.stamp_recording();

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant the minimum
-- ---------------------------------------------------------------------------

revoke all on public.contributors, public.draft_items, public.reviews, public.recordings
  from anon, authenticated;
revoke all on function public.studio_member(text), public.accept_consent(text)
  from public, anon;
grant execute on function public.studio_member(text), public.accept_consent(text)
  to authenticated;

grant select on public.contributors, public.draft_items, public.reviews, public.recordings
  to authenticated;
grant update (handle, display_name) on public.contributors to authenticated;
grant insert (draft_item_id, decision, text, annotated, glosses, note) on public.reviews
  to authenticated;
grant insert (id, draft_item_id, storage_path, mime_type, duration_ms, size_bytes)
  on public.recordings to authenticated;
grant update (status) on public.recordings to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.contributors enable row level security;
alter table public.draft_items  enable row level security;
alter table public.reviews      enable row level security;
alter table public.recordings   enable row level security;

-- contributors: you see and edit only yourself (handle and display name only).
create policy contributors_read_own on public.contributors
  for select to authenticated using (id = auth.uid());
create policy contributors_update_own on public.contributors
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- draft_items: members of the pack read them. Nobody edits them directly.
create policy draft_items_read on public.draft_items
  for select to authenticated using (public.studio_member(pack_id));

-- reviews: members read the history for their pack; insert only as themselves.
create policy reviews_read on public.reviews
  for select to authenticated using (
    exists (select 1 from public.draft_items d
            where d.id = draft_item_id and public.studio_member(d.pack_id)));
create policy reviews_insert_own on public.reviews
  for insert to authenticated with check (
    reviewer = auth.uid()
    and exists (select 1 from public.draft_items d
                where d.id = draft_item_id and public.studio_member(d.pack_id)));

-- recordings: you see, add and withdraw only your own.
create policy recordings_read_own on public.recordings
  for select to authenticated using (contributor_id = auth.uid());
create policy recordings_insert_own on public.recordings
  for insert to authenticated with check (
    contributor_id = auth.uid()
    and status = 'submitted'
    and exists (select 1 from public.draft_items d
                where d.id = draft_item_id and public.studio_member(d.pack_id)));
create policy recordings_withdraw_own on public.recordings
  for update to authenticated
  using (contributor_id = auth.uid())
  with check (contributor_id = auth.uid() and status = 'withdrawn');

-- ---------------------------------------------------------------------------
-- Storage: private bucket for audio, one folder per pack and contributor
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings', 'recordings', false, 10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']
)
on conflict (id) do nothing;

-- Path is <pack_id>/<contributor_id>/<file>. Upload and read only your own folder.
create policy recordings_upload_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.studio_member((storage.foldername(name))[1]));
create policy recordings_read_own_files on storage.objects
  for select to authenticated using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text);
-- No update or delete policy: files are immutable once uploaded.
