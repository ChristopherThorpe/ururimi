/**
 * What the learner knows. Pure data: every change goes through
 * `recordEvidence`, which returns a new state. The engine never reads a clock;
 * the caller says when each thing happened.
 *
 * ## The rule
 *
 * Each answer about an item is a piece of evidence:
 *
 * - `correct`: the learner answered right at the first try.
 * - `wrong`: the learner answered wrongly (including right only after a miss).
 * - `help`: the learner asked to be told, for instance by revealing the gloss.
 *
 * An item keeps a **streak**: how many `correct` answers in a row since the
 * last `wrong` or `help`. A `correct` adds one; a `wrong` or a `help` sets it
 * back to zero. An item is **known** while its streak is at least
 * `DEFAULT_RULE.successesToKnow` (2), and not yet known otherwise. One lucky
 * answer is therefore never enough, and one slip or request for help takes a
 * known item back to not yet known. When that happens to an item that was
 * known, it is counted as a **lapse**.
 *
 * Only the streak decides, so the threshold can change later without
 * rewriting saved state. Later features (spaced review, issue #23) can read
 * the other fields without changing the shape of the state: `lastAt` and
 * `lastKind` say when and how the item was last seen, `streak` and `lapses`
 * say how well it is holding, and the totals give the whole history in brief.
 * The rule does not look at how far apart the answers were; that is
 * scheduling, which builds on this rather than living in it.
 */

export type EvidenceKind = "correct" | "wrong" | "help";

/** What is known about one item. Plain data, safe to serialise as JSON. */
export interface ItemKnowledge {
  /** Consecutive `correct` answers since the last `wrong` or `help`. */
  streak: number;
  /** Times a known item was set back by a `wrong` or a `help`. */
  lapses: number;
  /** Totals over all evidence ever recorded. */
  correct: number;
  wrong: number;
  help: number;
  /** Time of the first evidence, in milliseconds since the Unix epoch. */
  firstAt: number;
  /** Time of the latest evidence, in milliseconds since the Unix epoch. */
  lastAt: number;
  /** The latest evidence. */
  lastKind: EvidenceKind;
}

export const LEARNER_STATE_VERSION = 1;

/** Everything the engine knows about one learner. Plain, serialisable data. */
export interface LearnerState {
  /** Shape of this data; bumped whenever a saved state could not be read by older code. */
  version: typeof LEARNER_STATE_VERSION;
  /** Knowledge by item id. Items never seen have no entry. */
  items: Readonly<Record<string, ItemKnowledge>>;
}

/** The parameters of the rule. */
export interface KnowledgeRule {
  /**
   * Consecutive correct answers needed before an item counts as known. A
   * value below 2 is treated as 2: one success is never enough.
   */
  successesToKnow: number;
}

export const DEFAULT_RULE: KnowledgeRule = { successesToKnow: 2 };

export function emptyLearnerState(): LearnerState {
  return { version: LEARNER_STATE_VERSION, items: {} };
}

/** What is recorded for an item, or nothing if the learner has never met it. */
export function knowledgeOf(state: LearnerState, itemId: string): ItemKnowledge | undefined {
  return Object.hasOwn(state.items, itemId) ? state.items[itemId] : undefined;
}

/** Whether the learner knows the item yet, by the rule above. */
export function isKnown(
  state: LearnerState,
  itemId: string,
  rule: KnowledgeRule = DEFAULT_RULE,
): boolean {
  return meetsRule(knowledgeOf(state, itemId), rule);
}

/**
 * Record one piece of evidence about an item at time `at` (milliseconds since
 * the Unix epoch). Evidence with a time that is not a finite number is
 * ignored. Evidence may arrive out of order; it is applied in the order given,
 * while `firstAt` and `lastAt` stay the earliest and latest times seen.
 */
export function recordEvidence(
  state: LearnerState,
  itemId: string,
  kind: EvidenceKind,
  at: number,
  rule: KnowledgeRule = DEFAULT_RULE,
): LearnerState {
  if (!Number.isFinite(at)) return state;
  const before = knowledgeOf(state, itemId);
  const lapsed = kind !== "correct" && meetsRule(before, rule);
  const after: ItemKnowledge = {
    streak: kind === "correct" ? (before?.streak ?? 0) + 1 : 0,
    lapses: (before?.lapses ?? 0) + (lapsed ? 1 : 0),
    correct: (before?.correct ?? 0) + (kind === "correct" ? 1 : 0),
    wrong: (before?.wrong ?? 0) + (kind === "wrong" ? 1 : 0),
    help: (before?.help ?? 0) + (kind === "help" ? 1 : 0),
    firstAt: before === undefined ? at : Math.min(before.firstAt, at),
    lastAt: before === undefined ? at : Math.max(before.lastAt, at),
    lastKind: before !== undefined && at < before.lastAt ? before.lastKind : kind,
  };
  return { ...state, items: { ...state.items, [itemId]: after } };
}

/**
 * Read saved data back into a learner state. Returns nothing when the data is
 * not a learner state this code understands (wrong shape, or a version it does
 * not know), so the app can decide whether to start afresh. Storage
 * implementations should pass what they load through this.
 */
export function readLearnerState(data: unknown): LearnerState | undefined {
  if (!isRecord(data) || data["version"] !== LEARNER_STATE_VERSION) return undefined;
  const stored = data["items"];
  if (!isRecord(stored)) return undefined;
  const entries: [string, ItemKnowledge][] = [];
  for (const [id, value] of Object.entries(stored)) {
    const knowledge = readItemKnowledge(value);
    if (knowledge === undefined) return undefined;
    entries.push([id, knowledge]);
  }
  // fromEntries defines own properties, so an id like "__proto__" stays plain data.
  return { version: LEARNER_STATE_VERSION, items: Object.fromEntries(entries) };
}

/**
 * Where a learner state is kept. The engine only defines this; the app
 * implements it for whatever it saves to (the device, later an account).
 * One store holds one learner's state.
 */
export interface LearnerStore {
  /** The saved state, or nothing if none was saved. Implementations use `readLearnerState`. */
  load(): Promise<LearnerState | undefined>;
  save(state: LearnerState): Promise<void>;
}

function meetsRule(knowledge: ItemKnowledge | undefined, rule: KnowledgeRule): boolean {
  return knowledge !== undefined && knowledge.streak >= Math.max(2, rule.successesToKnow);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readItemKnowledge(value: unknown): ItemKnowledge | undefined {
  if (!isRecord(value)) return undefined;
  const { streak, lapses, correct, wrong, help, firstAt, lastAt, lastKind } = value;
  if (!isCount(streak) || !isCount(lapses)) return undefined;
  if (!isCount(correct) || !isCount(wrong) || !isCount(help)) return undefined;
  if (!isTime(firstAt) || !isTime(lastAt)) return undefined;
  if (lastKind !== "correct" && lastKind !== "wrong" && lastKind !== "help") return undefined;
  return { streak, lapses, correct, wrong, help, firstAt, lastAt, lastKind };
}
