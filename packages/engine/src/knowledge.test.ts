import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE,
  emptyLearnerState,
  isKnown,
  knowledgeOf,
  readLearnerState,
  recordEvidence,
  type EvidenceKind,
  type LearnerState,
} from "./index.js";

const id = "xx.word.a";

/** Record a run of evidence for one item, one minute apart from minute 1. */
function record(kinds: readonly EvidenceKind[], itemId = id): LearnerState {
  return kinds.reduce(
    (state, kind, i) => recordEvidence(state, itemId, kind, (i + 1) * 60_000),
    emptyLearnerState(),
  );
}

describe("learner knowledge: the rule", () => {
  it("starts with nothing known", () => {
    const state = emptyLearnerState();
    expect(state.version).toBe(1);
    expect(knowledgeOf(state, id)).toBeUndefined();
    expect(isKnown(state, id)).toBe(false);
  });

  it("needs more than one success", () => {
    expect(isKnown(record(["correct"]), id)).toBe(false);
    expect(isKnown(record(["correct", "correct"]), id)).toBe(true);
    expect(isKnown(record(["correct", "correct", "correct"]), id)).toBe(true);
  });

  it("is not known after only mistakes or help", () => {
    expect(isKnown(record(["wrong", "help", "wrong"]), id)).toBe(false);
  });

  it("sets a known item back on a mistake, and counts a lapse", () => {
    const state = record(["correct", "correct", "wrong"]);
    expect(isKnown(state, id)).toBe(false);
    expect(knowledgeOf(state, id)).toMatchObject({ streak: 0, lapses: 1, wrong: 1 });
  });

  it("sets a known item back on help, and counts a lapse", () => {
    const state = record(["correct", "correct", "help"]);
    expect(isKnown(state, id)).toBe(false);
    expect(knowledgeOf(state, id)).toMatchObject({ streak: 0, lapses: 1, help: 1 });
  });

  it("needs the full streak again after a lapse", () => {
    const afterOne = record(["correct", "correct", "wrong", "correct"]);
    expect(isKnown(afterOne, id)).toBe(false);
    const afterTwo = record(["correct", "correct", "wrong", "correct", "correct"]);
    expect(isKnown(afterTwo, id)).toBe(true);
    expect(knowledgeOf(afterTwo, id)).toMatchObject({ streak: 2, lapses: 1 });
  });

  it("does not count a lapse for an item that was not known", () => {
    const state = record(["correct", "wrong", "help", "wrong"]);
    expect(knowledgeOf(state, id)?.lapses).toBe(0);
  });

  it("counts each lapse once, not each miss in a row", () => {
    const state = record(["correct", "correct", "wrong", "wrong", "help"]);
    expect(knowledgeOf(state, id)).toMatchObject({ lapses: 1, wrong: 2, help: 1 });
  });

  it("counts every lapse over a long history", () => {
    const state = record([
      ...["correct", "correct", "wrong"],
      ...["correct", "correct", "correct", "help"],
      ...["correct", "correct"],
    ] as const);
    expect(knowledgeOf(state, id)).toMatchObject({
      streak: 2,
      lapses: 2,
      correct: 7,
      wrong: 1,
      help: 1,
    });
    expect(isKnown(state, id)).toBe(true);
  });

  it("tracks items independently", () => {
    let state = record(["correct", "correct"], "xx.word.a");
    state = recordEvidence(state, "xx.word.b", "wrong", 5);
    expect(isKnown(state, "xx.word.a")).toBe(true);
    expect(isKnown(state, "xx.word.b")).toBe(false);
    expect(isKnown(state, "xx.word.c")).toBe(false);
  });

  it("takes the threshold as a parameter, and never below two", () => {
    const state = record(["correct", "correct"]);
    expect(isKnown(state, id, { successesToKnow: 3 })).toBe(false);
    expect(isKnown(record(["correct", "correct", "correct"]), id, { successesToKnow: 3 })).toBe(
      true,
    );
    expect(isKnown(record(["correct"]), id, { successesToKnow: 1 })).toBe(false);
    expect(isKnown(record(["correct"]), id, { successesToKnow: 0 })).toBe(false);
    expect(DEFAULT_RULE.successesToKnow).toBe(2);
  });

  it("counts a lapse by the rule in use", () => {
    const rule = { successesToKnow: 3 };
    let state = emptyLearnerState();
    for (const kind of ["correct", "correct", "wrong"] as const) {
      state = recordEvidence(state, id, kind, 1, rule);
    }
    expect(knowledgeOf(state, id)?.lapses).toBe(0);
  });
});

describe("learner knowledge: evidence and times", () => {
  it("records when an item was first and last seen and what happened last", () => {
    const state = record(["wrong", "correct", "help"]);
    expect(knowledgeOf(state, id)).toEqual({
      streak: 0,
      lapses: 0,
      correct: 1,
      wrong: 1,
      help: 1,
      firstAt: 60_000,
      lastAt: 180_000,
      lastKind: "help",
    });
  });

  it("does not change the state it was given", () => {
    const before = record(["correct"]);
    const snapshot = JSON.stringify(before);
    const after = recordEvidence(before, id, "correct", 999_999);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
  });

  it("ignores evidence whose time is not a finite number", () => {
    const state = record(["correct"]);
    expect(recordEvidence(state, id, "correct", Number.NaN)).toBe(state);
    expect(recordEvidence(state, id, "correct", Number.POSITIVE_INFINITY)).toBe(state);
  });

  it("accepts the same time twice", () => {
    let state = recordEvidence(emptyLearnerState(), id, "correct", 10);
    state = recordEvidence(state, id, "correct", 10);
    expect(isKnown(state, id)).toBe(true);
    expect(knowledgeOf(state, id)).toMatchObject({ firstAt: 10, lastAt: 10 });
  });

  it("keeps the earliest and latest times when evidence arrives out of order", () => {
    let state = recordEvidence(emptyLearnerState(), id, "correct", 200);
    state = recordEvidence(state, id, "wrong", 100);
    expect(knowledgeOf(state, id)).toMatchObject({
      firstAt: 100,
      lastAt: 200,
      lastKind: "correct",
      streak: 0,
    });
  });

  it("copes with an id that is also an object property name", () => {
    const state = recordEvidence(emptyLearnerState(), "__proto__", "correct", 1);
    expect(knowledgeOf(state, "__proto__")?.correct).toBe(1);
    expect(knowledgeOf(emptyLearnerState(), "__proto__")).toBeUndefined();
    expect(knowledgeOf(emptyLearnerState(), "toString")).toBeUndefined();
  });
});

describe("learner knowledge: saving and loading", () => {
  it("survives a round trip through JSON", () => {
    const state = record(["correct", "correct", "wrong", "correct"]);
    expect(readLearnerState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("keeps an id that is also an object property name as plain data", () => {
    const state = recordEvidence(emptyLearnerState(), "__proto__", "correct", 1);
    const loaded = readLearnerState(JSON.parse(JSON.stringify(state)));
    expect(loaded).toEqual(state);
    expect(knowledgeOf(loaded!, "__proto__")?.correct).toBe(1);
  });

  it("reads an empty state", () => {
    expect(readLearnerState(JSON.parse(JSON.stringify(emptyLearnerState())))).toEqual(
      emptyLearnerState(),
    );
  });

  it("refuses data that is not a learner state", () => {
    const good = JSON.parse(JSON.stringify(record(["correct"]))) as Record<string, unknown>;
    expect(readLearnerState(undefined)).toBeUndefined();
    expect(readLearnerState(null)).toBeUndefined();
    expect(readLearnerState("state")).toBeUndefined();
    expect(readLearnerState([])).toBeUndefined();
    expect(readLearnerState({ ...good, version: 2 })).toBeUndefined();
    expect(readLearnerState({ items: good["items"] })).toBeUndefined();
    expect(readLearnerState({ version: 1, items: [] })).toBeUndefined();
    expect(readLearnerState({ version: 1, items: { [id]: null } })).toBeUndefined();
  });

  it("refuses items with missing or invalid fields", () => {
    const item = (change: Record<string, unknown>) => ({
      version: 1,
      items: {
        [id]: {
          streak: 1,
          lapses: 0,
          correct: 1,
          wrong: 0,
          help: 0,
          firstAt: 1,
          lastAt: 1,
          lastKind: "correct",
          ...change,
        },
      },
    });
    expect(readLearnerState(item({}))).toBeDefined();
    expect(readLearnerState(item({ streak: -1 }))).toBeUndefined();
    expect(readLearnerState(item({ lapses: 1.5 }))).toBeUndefined();
    expect(readLearnerState(item({ wrong: "0" }))).toBeUndefined();
    expect(readLearnerState(item({ firstAt: Number.NaN }))).toBeUndefined();
    expect(readLearnerState(item({ lastAt: undefined }))).toBeUndefined();
    expect(readLearnerState(item({ lastKind: "skipped" }))).toBeUndefined();
  });

  it("drops fields it does not know", () => {
    const data = JSON.parse(JSON.stringify(record(["correct"]))) as {
      items: Record<string, Record<string, unknown>>;
    };
    data.items[id]!["extra"] = true;
    expect(knowledgeOf(readLearnerState(data)!, id)).not.toHaveProperty("extra");
  });
});
