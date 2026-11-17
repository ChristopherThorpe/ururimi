import type { ListenChooseExercise } from "./listenChoose.js";

/**
 * The learner's position in a run of exercises. Pure data: every change goes
 * through `answer` or `advance`, which return a new state.
 */
export interface Session {
  exercises: readonly ListenChooseExercise[];
  /** Index of the current exercise. */
  index: number;
  /**
   * - `answering`: waiting for the learner to choose.
   * - `correct`: the right option was chosen; waiting to move on.
   * - `finished`: every exercise is done.
   */
  phase: "answering" | "correct" | "finished";
  /** Wrong options chosen so far in the current exercise. */
  wrongOptionIds: readonly string[];
  /** One entry per completed exercise. */
  results: readonly ExerciseResult[];
}

export interface ExerciseResult {
  promptId: string;
  /** How many wrong choices came before the right one. */
  mistakes: number;
}

export function startSession(exercises: readonly ListenChooseExercise[]): Session {
  return {
    exercises,
    index: 0,
    phase: exercises.length === 0 ? "finished" : "answering",
    wrongOptionIds: [],
    results: [],
  };
}

export function currentExercise(session: Session): ListenChooseExercise | undefined {
  return session.phase === "finished" ? undefined : session.exercises[session.index];
}

/** Record the learner choosing an option. Ignored unless a choice is awaited. */
export function answer(session: Session, optionId: string): Session {
  const exercise = currentExercise(session);
  if (session.phase !== "answering" || exercise === undefined) return session;
  if (!exercise.optionIds.includes(optionId)) return session;

  if (optionId === exercise.promptId) {
    return {
      ...session,
      phase: "correct",
      results: [
        ...session.results,
        { promptId: exercise.promptId, mistakes: session.wrongOptionIds.length },
      ],
    };
  }
  if (session.wrongOptionIds.includes(optionId)) return session;
  return { ...session, wrongOptionIds: [...session.wrongOptionIds, optionId] };
}

/** Move on after a correct answer. Ignored in any other phase. */
export function advance(session: Session): Session {
  if (session.phase !== "correct") return session;
  const index = session.index + 1;
  return {
    ...session,
    index,
    phase: index >= session.exercises.length ? "finished" : "answering",
    wrongOptionIds: [],
  };
}
