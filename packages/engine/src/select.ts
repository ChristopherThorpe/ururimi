import type { AudioClip, Item, Lesson, Pack } from "@ururimi/content-schema";

export interface SelectOptions {
  /**
   * Whether items no speaker has reviewed may be shown. Learners should only
   * ever see reviewed content; this exists for previews and early releases.
   */
  includeUnreviewed: boolean;
}

/** The clip to play for an item: a human recording whenever one exists. */
export function preferredClip(item: Item): AudioClip | undefined {
  return item.audio.find((clip) => clip.kind === "human") ?? item.audio[0];
}

/** The items of a lesson that can be used in a listen-and-choose exercise. */
export function listenChooseItems(pack: Pack, lesson: Lesson, options: SelectOptions): Item[] {
  const byId = new Map(pack.items.map((item) => [item.id, item]));
  return lesson.itemIds
    .map((itemId) => byId.get(itemId))
    .filter((item): item is Item => item !== undefined)
    .filter((item) => item.image !== undefined && item.audio.length > 0)
    .filter((item) => options.includeUnreviewed || item.review.status === "reviewed");
}
