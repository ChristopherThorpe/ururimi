import type { Item } from "@ururimi/content-schema";
import { shuffle, type Rng } from "./rng.js";

/** Hear one item; pick its picture from among several. */
export interface ListenChooseExercise {
  /** The item whose audio is played. */
  promptId: string;
  /** The items whose pictures are offered, in display order. */
  optionIds: string[];
}

export interface ListenChooseOptions {
  rng: Rng;
  /** How many pictures to offer per exercise, including the right one. */
  optionCount: number;
}

/**
 * Build one exercise per item, in random order, each with random distractors.
 * Returns no exercises when there are too few items to offer a real choice.
 */
export function buildListenChoose(
  items: readonly Item[],
  { rng, optionCount }: ListenChooseOptions,
): ListenChooseExercise[] {
  if (optionCount < 2) throw new Error("optionCount must be at least 2");
  if (items.length < 2) return [];
  const count = Math.min(optionCount, items.length);

  return shuffle(items, rng).map((prompt) => {
    const distractors = shuffle(
      items.filter((item) => item.id !== prompt.id),
      rng,
    ).slice(0, count - 1);
    return {
      promptId: prompt.id,
      optionIds: shuffle([prompt, ...distractors], rng).map((item) => item.id),
    };
  });
}
