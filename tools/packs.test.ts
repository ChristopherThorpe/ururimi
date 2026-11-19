/**
 * The loader assembles a pack from `pack.json`, `items/<id>.json` and
 * `lessons/<id>.json`. These tests copy a real pack to a throwaway directory,
 * break it one way at a time, and check that the error names the file at fault.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listPackIds, loadPack, loadPackDir, packsDir } from "./packs.js";

const SOURCE = join(packsDir, "eo-fixture");
const ITEMS = ["eo.word.arbo", "eo.word.domo", "eo.word.suno"];

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ururimi-packs-"));
  dir = join(root, "eo-fixture");
  cpSync(SOURCE, dir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, path), "utf8")) as Record<string, unknown>;
const writeText = (path: string, text: string): void => writeFileSync(join(dir, path), text);
const writeJson = (path: string, data: unknown): void => writeText(path, JSON.stringify(data));
const remove = (path: string): void => rmSync(join(dir, path), { recursive: true });
const errorsOf = (): string[] => loadPackDir(dir).errors;

describe("loading a pack from files", () => {
  it("loads every pack in the repository without errors", () => {
    for (const id of listPackIds()) {
      const loaded = loadPack(id);
      expect(loaded.errors, id).toEqual([]);
      expect(loaded.pack?.id).toBe(id);
    }
  });

  it("keeps identity in pack.json and the rest in item and lesson files", () => {
    expect(Object.keys(readJson("pack.json")).sort()).toEqual([
      "id",
      "language",
      "schemaVersion",
      "supportLocales",
    ]);
    const { pack } = loadPackDir(dir);
    expect(pack?.language.autonym).toBe("Esperanto");
    expect(pack?.supportLocales).toEqual(["en", "fr"]);
    expect(pack?.items.map((item) => item.id)).toEqual(ITEMS);
    expect(pack?.lessons.map((lesson) => lesson.id)).toEqual(["eo.lesson.first-words"]);
  });

  it("orders items by id, whatever order the files were written in", () => {
    // Rewrite the files in reverse order, then add one that sorts before them all.
    for (const id of [...ITEMS].reverse()) {
      const item = readJson(`items/${id}.json`);
      remove(`items/${id}.json`);
      writeJson(`items/${id}.json`, item);
    }
    writeJson("items/eo.word.abelo.json", {
      ...readJson("items/eo.word.arbo.json"),
      id: "eo.word.abelo",
    });
    const loaded = loadPackDir(dir);
    expect(loaded.errors).toEqual([]);
    expect(loaded.pack?.items.map((item) => item.id)).toEqual(["eo.word.abelo", ...ITEMS]);
  });

  it("orders lessons by id", () => {
    const lesson = readJson("lessons/eo.lesson.first-words.json");
    writeJson("lessons/eo.lesson.a-second.json", { ...lesson, id: "eo.lesson.a-second" });
    expect(loadPackDir(dir).pack?.lessons.map((l) => l.id)).toEqual([
      "eo.lesson.a-second",
      "eo.lesson.first-words",
    ]);
  });

  it("ignores hidden files such as .gitkeep", () => {
    writeText("items/.gitkeep", "");
    expect(errorsOf()).toEqual([]);
  });
});

describe("errors name the file they came from", () => {
  it("rejects an item file whose name does not match its id", () => {
    writeJson("items/eo.word.wrong.json", readJson("items/eo.word.arbo.json"));
    remove("items/eo.word.arbo.json");
    expect(errorsOf()).toEqual([
      'items/eo.word.wrong.json: file name does not match item id "eo.word.arbo" (expected items/eo.word.arbo.json)',
    ]);
  });

  it("rejects a lesson file whose name does not match its id", () => {
    writeJson("lessons/eo.lesson.other.json", readJson("lessons/eo.lesson.first-words.json"));
    remove("lessons/eo.lesson.first-words.json");
    expect(errorsOf()).toEqual([
      'lessons/eo.lesson.other.json: file name does not match lesson id "eo.lesson.first-words" (expected lessons/eo.lesson.first-words.json)',
    ]);
  });

  it("reports a missing pack.json", () => {
    remove("pack.json");
    expect(errorsOf()).toEqual(["pack.json is missing"]);
  });

  it("reports missing items and lessons directories", () => {
    remove("items");
    remove("lessons");
    expect(errorsOf()).toEqual(["items/ is missing", "lessons/ is missing"]);
  });

  it("reports an empty items directory against items/", () => {
    for (const id of ITEMS) remove(`items/${id}.json`);
    expect(errorsOf().some((error) => error.startsWith("items/: "))).toBe(true);
  });

  it("reports malformed JSON in pack.json", () => {
    writeText("pack.json", "{ not json");
    expect(errorsOf()).toEqual([expect.stringMatching(/^pack\.json: not valid JSON/)]);
  });

  it("reports malformed JSON in an item and a lesson", () => {
    writeText("items/eo.word.suno.json", '{"id": "eo.word.suno",');
    writeText("lessons/eo.lesson.first-words.json", "nope");
    const errors = errorsOf();
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^items\/eo\.word\.suno\.json: not valid JSON/);
    expect(errors[1]).toMatch(/^lessons\/eo\.lesson\.first-words\.json: not valid JSON/);
  });

  it("reports a schema problem in an item against that item's file", () => {
    writeJson("items/eo.word.domo.json", { ...readJson("items/eo.word.domo.json"), kind: "verb" });
    const errors = errorsOf();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^items\/eo\.word\.domo\.json: kind: /);
  });

  it("reports a missing gloss against the item that lacks it", () => {
    writeJson("items/eo.word.suno.json", {
      ...readJson("items/eo.word.suno.json"),
      glosses: { en: "sun" },
    });
    expect(errorsOf()).toEqual([
      'items/eo.word.suno.json: glosses: missing gloss for support locale "fr"',
    ]);
  });

  it("reports a schema problem in pack.json against pack.json", () => {
    writeJson("pack.json", { ...readJson("pack.json"), supportLocales: [] });
    expect(errorsOf()).toEqual([expect.stringMatching(/^pack\.json: supportLocales: /)]);
  });

  it("reports a lesson naming an unknown item against the lesson's file", () => {
    writeJson("lessons/eo.lesson.first-words.json", {
      ...readJson("lessons/eo.lesson.first-words.json"),
      itemIds: ["eo.word.suno", "eo.word.nothing"],
    });
    expect(errorsOf()).toEqual([
      'lessons/eo.lesson.first-words.json: itemIds.1: unknown item id "eo.word.nothing"',
    ]);
  });

  it("refuses items left inside pack.json", () => {
    writeJson("pack.json", { ...readJson("pack.json"), items: [] });
    expect(errorsOf()).toEqual([
      'pack.json: "items" belongs in items/<id>.json files, not in pack.json',
    ]);
  });

  it("rejects files in items/ that are not JSON", () => {
    writeText("items/notes.txt", "hello");
    expect(errorsOf()).toEqual(["items/notes.txt: only .json files belong in items/"]);
  });

  it("reports a missing media file against the item that refers to it", () => {
    remove("media/images/sun.svg");
    expect(errorsOf()).toEqual(["items/eo.word.suno.json: missing file: media/images/sun.svg"]);
  });

  it("reports a media file that no item uses", () => {
    mkdirSync(join(dir, "media/extra"));
    writeText("media/extra/stray.txt", "x");
    expect(errorsOf()).toEqual(["file is not used by any item: media/extra/stray.txt"]);
  });

  it("reports a pack id that differs from its directory", () => {
    writeJson("pack.json", { ...readJson("pack.json"), id: "other" });
    expect(errorsOf()).toEqual([
      'pack.json: pack id "other" does not match its directory "eo-fixture"',
    ]);
  });
});
