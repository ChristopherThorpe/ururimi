import { packSchema, type Pack } from "./schema.js";

export * from "./licenses.js";
export * from "./schema.js";

export type ParseResult = { ok: true; pack: Pack } | { ok: false; errors: string[] };

/** Validate unknown data as a language pack, returning readable errors. */
export function parsePack(data: unknown): ParseResult {
  const result = packSchema.safeParse(data);
  if (result.success) return { ok: true, pack: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(pack)";
      return `${where}: ${issue.message}`;
    }),
  };
}
