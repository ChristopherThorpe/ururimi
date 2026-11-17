import { useMemo, useState } from "react";
import type { Item, Lesson as LessonData } from "@ururimi/content-schema";
import {
  advance,
  answer,
  buildListenChoose,
  currentExercise,
  listenChooseItems,
  preferredClip,
  startSession,
  type Session,
} from "@ururimi/engine";
import { playClip } from "./audio.js";
import { INCLUDE_UNREVIEWED, OPTION_COUNT } from "./config.js";
import { format, type LocaleId, type Strings } from "./locale.js";
import type { LoadedPack } from "./pack.js";

interface Props {
  loaded: LoadedPack;
  lesson: LessonData;
  locale: LocaleId;
  strings: Strings;
}

/** Hear a word or phrase, then choose the picture that matches it. */
export function Lesson({ loaded, lesson, locale, strings }: Props) {
  const { pack, url } = loaded;

  const items = useMemo(
    () => listenChooseItems(pack, lesson, { includeUnreviewed: INCLUDE_UNREVIEWED }),
    [pack, lesson],
  );
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const newSession = (): Session =>
    startSession(buildListenChoose(items, { rng: Math.random, optionCount: OPTION_COUNT }));
  const [session, setSession] = useState(newSession);

  const play = (item: Item | undefined) => {
    const clip = item && preferredClip(item);
    if (clip) playClip(url(clip.file));
  };

  const exercise = currentExercise(session);
  const prompt = exercise && byId.get(exercise.promptId);
  const total = session.exercises.length;

  const notices = [
    items.some((item) => item.review.status === "unreviewed") && strings.unreviewedNotice,
    items.some((item) => preferredClip(item)?.kind === "synthetic") && strings.syntheticNotice,
  ].filter((notice): notice is string => typeof notice === "string");

  const footer = notices.length > 0 && (
    <footer className="notices" data-testid="notices">
      {notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}
    </footer>
  );

  if (total === 0) {
    return (
      <main className="lesson lesson--centered">
        <p>{strings.empty}</p>
      </main>
    );
  }

  if (!exercise || !prompt) {
    return (
      <>
        <main className="lesson lesson--centered" data-testid="finished">
          <svg className="done-mark" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" />
            <path d="M19 33l9 9 17-19" />
          </svg>
          <p className="lesson__headline">{strings.finished}</p>
          <button className="button" onClick={() => setSession(newSession())}>
            {strings.restart}
          </button>
        </main>
        {footer}
      </>
    );
  }

  const solved = session.phase === "correct";
  const clip = preferredClip(prompt);

  const next = () => {
    const advanced = advance(session);
    setSession(advanced);
    // Played here, inside the tap, so phones allow it.
    const upcoming = currentExercise(advanced);
    play(upcoming && byId.get(upcoming.promptId));
  };

  return (
    <>
      <main className="lesson">
        <progress
          className="progress"
          value={session.results.length}
          max={total}
          aria-label={format(strings.progress, { current: session.index + 1, total })}
        />
        <p className="lesson__instruction">{strings.instruction}</p>

        <button
          className="listen"
          onClick={() => play(prompt)}
          aria-label={strings.listen}
          data-testid="listen"
          data-clip={clip?.file}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 19h8l11-9v28l-11-9H8z" />
            <path className="listen__wave" d="M33 17a10 10 0 0 1 0 14M38 11a18 18 0 0 1 0 26" />
          </svg>
        </button>

        <div className="options" data-count={exercise.optionIds.length}>
          {exercise.optionIds.map((optionId) => {
            const option = byId.get(optionId);
            if (!option?.image) return null;
            const wrong = session.wrongOptionIds.includes(optionId);
            const right = solved && optionId === exercise.promptId;
            return (
              <button
                key={optionId}
                className="option"
                data-item-id={optionId}
                data-state={right ? "right" : wrong ? "wrong" : "open"}
                disabled={wrong || (solved && !right)}
                onClick={() => setSession(answer(session, optionId))}
              >
                <img src={url(option.image.file)} alt={option.glosses[locale] ?? ""} />
              </button>
            );
          })}
        </div>

        <div className="feedback" aria-live="polite">
          {solved ? (
            <>
              <p className="feedback__word" lang={pack.language.tag} data-testid="answer-text">
                {prompt.text}
              </p>
              <p className="feedback__status feedback__status--right">{strings.correct}</p>
            </>
          ) : (
            session.wrongOptionIds.length > 0 && (
              <p className="feedback__status" data-testid="wrong-message">
                {strings.wrong}
              </p>
            )
          )}
        </div>

        {solved && (
          <button className="button button--wide" onClick={next} data-testid="next">
            {strings.next}
          </button>
        )}
      </main>
      {footer}
    </>
  );
}
