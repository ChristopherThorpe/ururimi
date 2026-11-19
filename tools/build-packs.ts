/**
 * Copy validated language packs into the web app's public directory, so the
 * app can fetch them at run time. Refuses to build a pack with any problem.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listPackIds, loadPack, readDefaultPackId, referencedFiles, repoRoot } from "./packs.js";

const outDir = join(repoRoot, "apps", "web", "public", "packs");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const built: { id: string; autonym: string }[] = [];
for (const id of listPackIds()) {
  const loaded = loadPack(id);
  if (loaded.errors.length > 0 || !loaded.pack) {
    console.error(`Cannot build pack "${id}":`);
    for (const error of loaded.errors) console.error(`  ${error}`);
    process.exit(1);
  }
  mkdirSync(join(outDir, id), { recursive: true });
  writeFileSync(join(outDir, id, "pack.json"), JSON.stringify(loaded.pack));
  for (const file of referencedFiles(loaded.pack)) {
    const target = join(outDir, id, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(loaded.dir, file), target);
  }
  built.push({ id, autonym: loaded.pack.language.autonym });
}

const defaultPack = readDefaultPackId();
if (!built.some((pack) => pack.id === defaultPack)) {
  console.error(`content/config.json: default pack "${defaultPack}" does not exist`);
  process.exit(1);
}
writeFileSync(join(outDir, "index.json"), JSON.stringify({ defaultPack, packs: built }));
console.log(`Built ${built.length} packs: ${built.map((pack) => pack.id).join(", ")}`);
