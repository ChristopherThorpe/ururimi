import type { Item, Pack } from "@ururimi/content-schema";

/** Minimal items and packs for engine tests. Not real language content. */
export function makeItem(name: string, overrides: Partial<Item> = {}): Item {
  const provenance = { source: "test", license: "CC0-1.0" as const };
  return {
    id: `xx.word.${name}`,
    kind: "word",
    text: name,
    glosses: { en: name },
    image: { file: `media/${name}.svg`, provenance },
    audio: [{ kind: "synthetic", file: `media/${name}.wav`, voice: "test", provenance }],
    provenance,
    review: { status: "reviewed", reviewer: "tester", date: "2026-11-17" },
    ...overrides,
  };
}

export function makePack(items: Item[]): Pack {
  return {
    schemaVersion: 1,
    id: "xx",
    language: { tag: "xx", autonym: "Xx", names: { en: "Xxish" } },
    supportLocales: ["en"],
    items,
    lessons: [
      { id: "xx.lesson.1", exercise: "listen-choose", itemIds: items.map((item) => item.id) },
    ],
  };
}
