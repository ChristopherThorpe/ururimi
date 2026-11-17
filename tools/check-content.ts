/**
 * Check every language pack: format, files on disk, licences, review status.
 *
 *   pnpm content:check               fail on broken packs
 *   pnpm content:check --commercial  also fail on non-commercial assets
 */
import { listPackIds, loadPack, nonCommercialAssets, readDefaultPackId } from "./packs.js";

const strictCommercial = process.argv.includes("--commercial");
let failed = false;

const ids = listPackIds();
const defaultPack = readDefaultPackId();
if (!ids.includes(defaultPack)) {
  console.error(`content/config.json: default pack "${defaultPack}" does not exist`);
  failed = true;
}

for (const id of ids) {
  const loaded = loadPack(id);
  if (loaded.errors.length > 0 || !loaded.pack) {
    failed = true;
    console.error(`✗ ${id}`);
    for (const error of loaded.errors) console.error(`    ${error}`);
    continue;
  }

  const { pack } = loaded;
  const reviewed = pack.items.filter((item) => item.review.status === "reviewed").length;
  const human = pack.items.filter((item) => item.audio.some((c) => c.kind === "human")).length;
  const restricted = nonCommercialAssets(pack);

  console.log(`✓ ${id} (${pack.language.autonym})`);
  console.log(`    items: ${pack.items.length}, reviewed by a speaker: ${reviewed}`);
  console.log(`    items with a human recording: ${human}`);
  console.log(`    non-commercial assets: ${restricted.length}`);
  if (strictCommercial && restricted.length > 0) {
    failed = true;
    for (const asset of restricted) console.error(`    ✗ ${asset}`);
  }
}

if (failed) {
  console.error("\nContent check failed.");
  process.exit(1);
}
