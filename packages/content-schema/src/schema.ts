import { z } from "zod";
import { LICENSE_IDS } from "./licenses.js";

/**
 * The format of a language pack.
 *
 * A pack holds everything that is specific to one target language. Code in
 * `packages/` and `apps/` must work for any pack that satisfies this schema.
 */

/** Lowercase identifier segments joined by dots, e.g. `xx.word.example`. */
const id = z
  .string()
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "use lowercase letters, digits, dots and hyphens");

/** A BCP 47 language tag such as `rn`, `en` or `fr-CA`. */
const languageTag = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "use a BCP 47 language tag");

/** A path inside the pack directory. Never absolute, never climbing out. */
const packPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), {
    message: "must be a relative path inside the pack",
  });

const license = z.enum(LICENSE_IDS);

/** Text in each support locale, keyed by language tag. */
const localized = z.record(languageTag, z.string().min(1));

/** Where a piece of content came from and under what terms. */
export const provenanceSchema = z.strictObject({
  /** Who or what produced it, in plain words. */
  source: z.string().min(1),
  license,
  url: z.string().url().optional(),
});

/** Whether a speaker of the target language has checked the item. */
export const reviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unreviewed") }),
  z.strictObject({
    status: z.literal("reviewed"),
    reviewer: z.string().min(1),
    /** ISO date, e.g. 2026-11-17. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

export const imageSchema = z.strictObject({
  file: packPath,
  provenance: provenanceSchema,
});

export const audioClipSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("human"),
    file: packPath,
    /** Identifier of the speaker, as listed in the pack's speakers. */
    speaker: id,
    provenance: provenanceSchema,
  }),
  z.strictObject({
    kind: z.literal("synthetic"),
    file: packPath,
    /** The model or voice that produced the clip. */
    voice: z.string().min(1),
    provenance: provenanceSchema,
  }),
]);

export const itemSchema = z.strictObject({
  id,
  kind: z.enum(["word", "phrase", "sentence"]),
  /** The item in the target language's standard spelling. */
  text: z.string().min(1),
  /**
   * The same text with pronunciation detail that standard spelling omits
   * (for example tone or vowel length). Optional learner aid.
   */
  annotated: z.string().min(1).optional(),
  /** Meaning in each support locale. Never shown once immersion is reached. */
  glosses: localized,
  image: imageSchema.optional(),
  audio: z.array(audioClipSchema),
  provenance: provenanceSchema,
  review: reviewSchema,
});

export const lessonSchema = z.strictObject({
  id,
  exercise: z.enum(["listen-choose"]),
  itemIds: z.array(id).min(2),
});

export const packSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    language: z.strictObject({
      tag: languageTag,
      /** The language's name in the language itself. */
      autonym: z.string().min(1),
      /** The language's name in each support locale. */
      names: localized,
    }),
    /** Languages a learner may already know, used only until immersion. */
    supportLocales: z.array(languageTag).min(1),
    items: z.array(itemSchema).min(1),
    lessons: z.array(lessonSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const itemIds = new Set<string>();
    pack.items.forEach((item, i) => {
      if (itemIds.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "id"],
          message: `duplicate item id "${item.id}"`,
        });
      }
      itemIds.add(item.id);
      for (const locale of pack.supportLocales) {
        if (!(locale in item.glosses)) {
          ctx.addIssue({
            code: "custom",
            path: ["items", i, "glosses"],
            message: `missing gloss for support locale "${locale}"`,
          });
        }
      }
    });

    for (const locale of pack.supportLocales) {
      if (!(locale in pack.language.names)) {
        ctx.addIssue({
          code: "custom",
          path: ["language", "names"],
          message: `missing language name for support locale "${locale}"`,
        });
      }
    }

    const lessonIds = new Set<string>();
    pack.lessons.forEach((lesson, i) => {
      if (lessonIds.has(lesson.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["lessons", i, "id"],
          message: `duplicate lesson id "${lesson.id}"`,
        });
      }
      lessonIds.add(lesson.id);
      lesson.itemIds.forEach((itemId, j) => {
        if (!itemIds.has(itemId)) {
          ctx.addIssue({
            code: "custom",
            path: ["lessons", i, "itemIds", j],
            message: `unknown item id "${itemId}"`,
          });
        }
      });
    });
  });

export type Provenance = z.infer<typeof provenanceSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Image = z.infer<typeof imageSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Pack = z.infer<typeof packSchema>;
