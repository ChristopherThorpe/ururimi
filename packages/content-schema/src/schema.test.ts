import { describe, expect, it } from "vitest";
import { allowsCommercialUse, parsePack } from "./index.js";

function validPack(): Record<string, unknown> {
  // Built fresh each time so one test's changes cannot reach another.
  const provenance = () => ({ source: "test", license: "CC0-1.0" });
  return {
    schemaVersion: 1,
    id: "xx",
    language: { tag: "xx", autonym: "Xx", names: { en: "Xxish" } },
    supportLocales: ["en"],
    items: [
      {
        id: "xx.word.a",
        kind: "word",
        text: "a",
        glosses: { en: "first" },
        audio: [
          { kind: "synthetic", file: "media/a.wav", voice: "test", provenance: provenance() },
        ],
        provenance: provenance(),
        review: { status: "unreviewed" },
      },
      {
        id: "xx.word.b",
        kind: "word",
        text: "b",
        glosses: { en: "second" },
        audio: [],
        provenance: provenance(),
        review: { status: "reviewed", reviewer: "someone", date: "2026-11-17" },
      },
    ],
    lessons: [
      { id: "xx.lesson.1", exercise: "listen-choose", itemIds: ["xx.word.a", "xx.word.b"] },
    ],
  };
}

function errorsFor(mutate: (pack: any) => void): string[] {
  const pack = validPack();
  mutate(pack);
  const result = parsePack(pack);
  return result.ok ? [] : result.errors;
}

describe("parsePack", () => {
  it("accepts a valid pack", () => {
    expect(parsePack(validPack())).toMatchObject({ ok: true });
  });

  it("rejects a lesson that names an unknown item", () => {
    const errors = errorsFor((p) => p.lessons[0].itemIds.push("xx.word.missing"));
    expect(errors).toEqual(['lessons.0.itemIds.2: unknown item id "xx.word.missing"']);
  });

  it("rejects duplicate item ids", () => {
    const errors = errorsFor((p) => (p.items[1].id = "xx.word.a"));
    expect(errors.some((e) => e.includes('duplicate item id "xx.word.a"'))).toBe(true);
  });

  it("requires a gloss in every support locale", () => {
    const errors = errorsFor((p) => p.supportLocales.push("fr"));
    expect(errors).toContain('items.0.glosses: missing gloss for support locale "fr"');
    expect(errors).toContain('language.names: missing language name for support locale "fr"');
  });

  it("requires provenance with a known licence", () => {
    const errors = errorsFor((p) => (p.items[0].provenance.license = "all-rights-reserved"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^items\.0\.provenance\.license/);
  });

  it("requires a reviewer and date on reviewed items", () => {
    const errors = errorsFor((p) => (p.items[1].review = { status: "reviewed" }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects media paths that leave the pack", () => {
    const errors = errorsFor((p) => (p.items[0].audio[0].file = "../secret.wav"));
    expect(errors).toEqual(["items.0.audio.0.file: must be a relative path inside the pack"]);
  });

  it("rejects unknown fields so typos are caught", () => {
    const errors = errorsFor((p) => (p.items[0].glos = { en: "typo" }));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("allowsCommercialUse", () => {
  it("flags non-commercial licences", () => {
    expect(allowsCommercialUse("CC-BY-4.0")).toBe(true);
    expect(allowsCommercialUse("CC-BY-NC-4.0")).toBe(false);
  });
});
