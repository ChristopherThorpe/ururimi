import { describe, expect, it } from "vitest";
import {
  advance,
  answer,
  buildListenChoose,
  currentExercise,
  listenChooseItems,
  preferredClip,
  seededRng,
  shuffle,
  startSession,
} from "./index.js";
import { makeItem, makePack } from "./testing.js";

const items = ["a", "b", "c", "d", "e"].map((name) => makeItem(name));

describe("seededRng and shuffle", () => {
  it("gives the same sequence for the same seed", () => {
    const first = shuffle(items, seededRng(7)).map((item) => item.id);
    const second = shuffle(items, seededRng(7)).map((item) => item.id);
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(items.map((item) => item.id).sort());
  });
});

describe("preferredClip", () => {
  it("prefers a human recording over a synthetic one", () => {
    const provenance = { source: "test", license: "CC0-1.0" as const };
    const item = makeItem("a", {
      audio: [
        { kind: "synthetic", file: "tts.wav", voice: "test", provenance },
        { kind: "human", file: "human.wav", speaker: "s1", provenance },
      ],
    });
    expect(preferredClip(item)?.file).toBe("human.wav");
  });

  it("returns nothing when an item has no audio", () => {
    expect(preferredClip(makeItem("a", { audio: [] }))).toBeUndefined();
  });
});

describe("listenChooseItems", () => {
  const unreviewed = makeItem("u", { review: { status: "unreviewed" } });
  const silent = makeItem("s", { audio: [] });
  const pack = makePack([...items, unreviewed, silent]);
  const lesson = pack.lessons[0]!;

  it("leaves out unreviewed items unless asked", () => {
    const ids = listenChooseItems(pack, lesson, { includeUnreviewed: false }).map((i) => i.id);
    expect(ids).toEqual(items.map((item) => item.id));
  });

  it("includes unreviewed items for previews", () => {
    const ids = listenChooseItems(pack, lesson, { includeUnreviewed: true }).map((i) => i.id);
    expect(ids).toContain(unreviewed.id);
  });

  it("always leaves out items with no audio", () => {
    const ids = listenChooseItems(pack, lesson, { includeUnreviewed: true }).map((i) => i.id);
    expect(ids).not.toContain(silent.id);
  });
});

describe("buildListenChoose", () => {
  it("prompts every item once and always offers the right answer", () => {
    const exercises = buildListenChoose(items, { rng: seededRng(1), optionCount: 3 });
    expect(exercises.map((e) => e.promptId).sort()).toEqual(items.map((item) => item.id).sort());
    for (const exercise of exercises) {
      expect(exercise.optionIds).toHaveLength(3);
      expect(new Set(exercise.optionIds).size).toBe(3);
      expect(exercise.optionIds).toContain(exercise.promptId);
    }
  });

  it("offers fewer options when there are few items", () => {
    const exercises = buildListenChoose(items.slice(0, 2), { rng: seededRng(1), optionCount: 4 });
    expect(exercises.every((e) => e.optionIds.length === 2)).toBe(true);
  });

  it("builds nothing when no real choice is possible", () => {
    expect(buildListenChoose(items.slice(0, 1), { rng: seededRng(1), optionCount: 2 })).toEqual([]);
  });

  it("does not always put the right answer in the same place", () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      for (const e of buildListenChoose(items, { rng: seededRng(seed), optionCount: 2 })) {
        positions.add(e.optionIds.indexOf(e.promptId));
      }
    }
    expect(positions).toEqual(new Set([0, 1]));
  });
});

describe("session", () => {
  const exercises = [
    { promptId: "a", optionIds: ["a", "b", "c"] },
    { promptId: "b", optionIds: ["c", "b"] },
  ];

  it("is finished at once when there are no exercises", () => {
    expect(startSession([]).phase).toBe("finished");
  });

  it("keeps the learner on an exercise until they choose correctly", () => {
    let session = startSession(exercises);
    session = answer(session, "b");
    expect(session.phase).toBe("answering");
    expect(session.wrongOptionIds).toEqual(["b"]);
    session = answer(session, "b");
    expect(session.wrongOptionIds).toEqual(["b"]);
    session = answer(session, "a");
    expect(session.phase).toBe("correct");
    expect(session.results).toEqual([{ promptId: "a", mistakes: 1 }]);
  });

  it("ignores options that are not on offer", () => {
    const session = startSession(exercises);
    expect(answer(session, "zzz")).toBe(session);
  });

  it("only advances after a correct answer", () => {
    const session = startSession(exercises);
    expect(advance(session)).toBe(session);
  });

  it("runs through to the end", () => {
    let session = startSession(exercises);
    session = advance(answer(session, "a"));
    expect(currentExercise(session)?.promptId).toBe("b");
    expect(session.wrongOptionIds).toEqual([]);
    session = advance(answer(session, "b"));
    expect(session.phase).toBe("finished");
    expect(currentExercise(session)).toBeUndefined();
    expect(session.results).toEqual([
      { promptId: "a", mistakes: 0 },
      { promptId: "b", mistakes: 0 },
    ]);
    expect(answer(session, "a")).toBe(session);
  });
});
