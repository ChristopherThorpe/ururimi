import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowsCommercialUse,
  packSchema,
  type Pack,
  type Provenance,
} from "@ururimi/content-schema";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const contentDir = join(repoRoot, "content");
export const packsDir = join(contentDir, "packs");

export interface LoadedPack {
  id: string;
  dir: string;
  /** Present only when the pack file parsed and validated. */
  pack?: Pack;
  /** Problems that must be fixed before the pack can ship. */
  errors: string[];
}

export function listPackIds(): string[] {
  return readdirSync(packsDir)
    .filter((name) => statSync(join(packsDir, name)).isDirectory())
    .sort();
}

/** Every file a pack refers to, relative to the pack directory. */
export function referencedFiles(pack: Pack): string[] {
  const files = new Set<string>();
  for (const item of pack.items) {
    if (item.image) files.add(item.image.file);
    for (const clip of item.audio) files.add(clip.file);
  }
  return [...files].sort();
}

/** Every licence statement in a pack, with a label saying what it covers. */
export function provenances(pack: Pack): { what: string; provenance: Provenance }[] {
  return pack.items.flatMap((item) => [
    { what: `${item.id} text`, provenance: item.provenance },
    ...(item.image ? [{ what: `${item.id} image`, provenance: item.image.provenance }] : []),
    ...item.audio.map((clip) => ({
      what: `${item.id} audio ${clip.file}`,
      provenance: clip.provenance,
    })),
  ]);
}

export function nonCommercialAssets(pack: Pack): string[] {
  return provenances(pack)
    .filter(({ provenance }) => !allowsCommercialUse(provenance.license))
    .map(({ what, provenance }) => `${what} (${provenance.license})`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

interface SourceFile {
  /** Path relative to the pack directory, with forward slashes. */
  path: string;
  data: unknown;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read every `<name>.json` in one subdirectory of a pack, in a fixed order
 * (by file name, plain code-unit comparison, so it never depends on the
 * operating system or locale). Problems are returned, not thrown.
 */
function readJsonDir(dir: string, sub: string): { files: SourceFile[]; errors: string[] } {
  const errors: string[] = [];
  const files: SourceFile[] = [];
  const subDir = join(dir, sub);
  if (!existsSync(subDir) || !statSync(subDir).isDirectory()) {
    return { files, errors: [`${sub}/ is missing`] };
  }
  const names = readdirSync(subDir)
    .filter((name) => !name.startsWith("."))
    .sort(byCodeUnit);
  for (const name of names) {
    const path = `${sub}/${name}`;
    if (statSync(join(subDir, name)).isDirectory() || !name.endsWith(".json")) {
      errors.push(`${path}: only .json files belong in ${sub}/`);
      continue;
    }
    try {
      files.push({ path, data: JSON.parse(readFileSync(join(subDir, name), "utf8")) });
    } catch (error) {
      errors.push(`${path}: not valid JSON: ${describe(error)}`);
    }
  }
  return { files, errors };
}

function idOf(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Read and fully check the pack in one directory: `pack.json` (identity,
 * language, support locales), `items/<item-id>.json`, `lessons/<lesson-id>.json`,
 * and the media files on disk.
 *
 * The assembled `Pack` lists items and lessons sorted by id, so the order never
 * depends on the file system. Every error names the file it came from.
 */
export function loadPackDir(dir: string): LoadedPack {
  const id = basename(dir);
  const fail = (errors: string[]): LoadedPack => ({ id, dir, errors });

  const headFile = join(dir, "pack.json");
  if (!existsSync(headFile)) return fail(["pack.json is missing"]);
  let head: unknown;
  try {
    head = JSON.parse(readFileSync(headFile, "utf8"));
  } catch (error) {
    return fail([`pack.json: not valid JSON: ${describe(error)}`]);
  }
  if (typeof head !== "object" || head === null || Array.isArray(head)) {
    return fail(["pack.json: must be a JSON object"]);
  }

  const itemDir = readJsonDir(dir, "items");
  const lessonDir = readJsonDir(dir, "lessons");
  const structural = [...itemDir.errors, ...lessonDir.errors];
  for (const key of ["items", "lessons"]) {
    if (key in head) {
      structural.push(`pack.json: "${key}" belongs in ${key}/<id>.json files, not in pack.json`);
    }
  }
  if (structural.length > 0) return fail(structural);

  const errors: string[] = [];
  const checkName = (files: SourceFile[], noun: string): void => {
    for (const file of files) {
      const own = idOf(file.data);
      const expected = file.path.replace(/[^/]*$/, `${own}.json`);
      if (own !== undefined && file.path !== expected) {
        errors.push(
          `${file.path}: file name does not match ${noun} id "${own}" (expected ${expected})`,
        );
      }
    }
  };
  checkName(itemDir.files, "item");
  checkName(lessonDir.files, "lesson");

  /** The file a schema issue came from, and where inside it the issue is. */
  const locate = (path: readonly PropertyKey[]): { file: string; rest: PropertyKey[] } => {
    const [section, index] = path;
    if (section === "items" || section === "lessons") {
      const files = section === "items" ? itemDir.files : lessonDir.files;
      const file = typeof index === "number" ? files[index] : undefined;
      if (file) return { file: file.path, rest: path.slice(2) };
      return { file: `${section}/`, rest: path.slice(1) };
    }
    return { file: "pack.json", rest: [...path] };
  };

  const parsed = packSchema.safeParse({
    ...head,
    items: itemDir.files.map((file) => file.data),
    lessons: lessonDir.files.map((file) => file.data),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const { file, rest } = locate(issue.path);
      const where = rest.length > 0 ? rest.map(String).join(".") : "(whole file)";
      errors.push(`${file}: ${where}: ${issue.message}`);
    }
    return fail(errors);
  }
  const pack = parsed.data;
  if (pack.id !== id)
    errors.push(`pack.json: pack id "${pack.id}" does not match its directory "${id}"`);

  const referenced = new Set<string>();
  pack.items.forEach((item, index) => {
    const source = itemDir.files[index]?.path ?? "items/";
    for (const path of referencedFiles({ ...pack, items: [item] })) {
      referenced.add(path);
      if (!existsSync(join(dir, path))) errors.push(`${source}: missing file: ${path}`);
    }
  });
  const mediaDir = join(dir, "media");
  if (existsSync(mediaDir)) {
    for (const path of walk(mediaDir)) {
      const rel = relative(dir, path).split("\\").join("/");
      if (!referenced.has(rel)) errors.push(`file is not used by any item: ${rel}`);
    }
  }
  return { id, dir, pack, errors };
}

/** Read and fully check the pack in `content/packs/<id>/`. */
export function loadPack(id: string): LoadedPack {
  return loadPackDir(join(packsDir, id));
}

export function readDefaultPackId(): string {
  const config = JSON.parse(readFileSync(join(contentDir, "config.json"), "utf8")) as {
    defaultPack?: unknown;
  };
  if (typeof config.defaultPack !== "string") {
    throw new Error("content/config.json must name a defaultPack");
  }
  return config.defaultPack;
}
