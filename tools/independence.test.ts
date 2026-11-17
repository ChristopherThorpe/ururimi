/**
 * The code must work for any language pack, so nothing from a pack may be
 * written into it. This scans the app and package sources for the words and
 * language names that belong to the packs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listPackIds, loadPack, repoRoot } from "./packs.js";

const SOURCE_ROOTS = ["packages", "apps"];
const SOURCE_FILES = /\.(ts|tsx|css|html|json|webmanifest)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "packs", "test-results", "playwright-report"]);
/** Shorter words are too likely to collide with ordinary identifiers. */
const MIN_LENGTH = 4;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : sourceFiles(path);
    return SOURCE_FILES.test(name) ? [path] : [];
  });
}

function packTerms(): string[] {
  const terms = new Set<string>();
  for (const id of listPackIds()) {
    const { pack } = loadPack(id);
    if (!pack) continue;
    terms.add(pack.language.autonym);
    for (const name of Object.values(pack.language.names)) terms.add(name);
    for (const item of pack.items) {
      terms.add(item.text);
      if (item.annotated) terms.add(item.annotated);
    }
  }
  return [...terms].filter((term) => term.length >= MIN_LENGTH);
}

describe("language independence", () => {
  it("finds pack content to look for", () => {
    expect(packTerms().length).toBeGreaterThan(0);
  });

  it("keeps pack words and language names out of the code", () => {
    const patterns = packTerms().map((term) => ({
      term,
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "iu",
      ),
    }));
    const leaks: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const text = readFileSync(file, "utf8");
        for (const { term, pattern } of patterns) {
          if (pattern.test(text)) leaks.push(`${relative(repoRoot, file)}: "${term}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
