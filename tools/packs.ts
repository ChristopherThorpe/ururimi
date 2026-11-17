import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowsCommercialUse,
  parsePack,
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

/** Read and fully check one pack: schema, id, and the files on disk. */
export function loadPack(id: string): LoadedPack {
  const dir = join(packsDir, id);
  const file = join(dir, "pack.json");
  if (!existsSync(file)) return { id, dir, errors: ["pack.json is missing"] };

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { id, dir, errors: [`pack.json is not valid JSON: ${String(error)}`] };
  }

  const parsed = parsePack(data);
  if (!parsed.ok) return { id, dir, errors: parsed.errors };
  const pack = parsed.pack;

  const errors: string[] = [];
  if (pack.id !== id) errors.push(`pack id "${pack.id}" does not match its directory "${id}"`);

  const referenced = referencedFiles(pack);
  for (const path of referenced) {
    if (!existsSync(join(dir, path))) errors.push(`missing file: ${path}`);
  }
  const mediaDir = join(dir, "media");
  if (existsSync(mediaDir)) {
    const known = new Set(referenced);
    for (const path of walk(mediaDir)) {
      const rel = relative(dir, path).split("\\").join("/");
      if (!known.has(rel)) errors.push(`file is not used by any item: ${rel}`);
    }
  }
  return { id, dir, pack, errors };
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
